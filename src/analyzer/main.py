import asyncio
import os
import re
import uuid
import httpx

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from twitter import get_user, get_tweets
from claude import analyze, describe_new_images
from cache import get_cached, set_cached, get_client as get_redis
import store

app = FastAPI()

_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "https://0x3654.com").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "DELETE"],
    allow_headers=["*"],
)


def _require_admin(x_admin_key: str | None):
    admin_key = os.environ.get("ADMIN_KEY")
    if not admin_key or x_admin_key != admin_key:
        raise HTTPException(403, "forbidden")

# Очередь и хранилище результатов
job_queue: asyncio.Queue = asyncio.Queue()
job_results: dict[str, dict] = {}


async def worker():
    """Единственный воркер — задачи строго по одной."""
    while True:
        job_id, username = await job_queue.get()
        job_results[job_id]["status"] = "processing"

        # Обновить позиции ожидающих
        waiting = [jid for jid, d in job_results.items() if d["status"] == "pending"]
        for i, jid in enumerate(waiting):
            job_results[jid]["position"] = i + 1

        try:
            # 1. Redis-кэш — отвечаем сразу
            cached = await get_cached(username)
            if cached:
                job_results[job_id] = {"status": "done", "verdict": cached, "cached": True, "position": 0}
                continue

            # 2. Файловый кэш твитов
            tweet_data = store.get_tweet_cache(username)

            if tweet_data:
                user = tweet_data["user"]
                tweets = tweet_data["tweets"]
            else:
                # 3. Fetch из Twitter
                user = await get_user(username)
                tweets = await get_tweets(user["id"])
                if not tweets:
                    raise ValueError("No tweets found")
                store.save_tweet_cache(username, {"user": user, "tweets": tweets})

            # 4. Описать новые картинки (которых ещё нет в кэше)
            tweets = await describe_new_images(tweets)
            store.save_tweet_cache(username, {"user": user, "tweets": tweets})

            # 5. LLM-вердикт
            verdict = await analyze(user, tweets)
            await set_cached(username, verdict)
            job_results[job_id] = {"status": "done", "verdict": verdict, "cached": False, "position": 0}

        except ValueError as e:
            msg = str(e)
            if "private_or_not_found" in msg:
                job_results[job_id] = {"status": "error", "error": "Аккаунт не найден или закрытый", "position": 0}
            else:
                job_results[job_id] = {"status": "error", "error": msg, "position": 0}
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                job_results[job_id] = {
                    "status": "error",
                    "error": "Сервис временно не работает — закончились лимиты. Попробуй позже.",
                    "position": 0,
                }
            else:
                job_results[job_id] = {
                    "status": "error",
                    "error": "Сервис временно не работает. Попробуй позже.",
                    "position": 0,
                }
        except Exception:
            import traceback; traceback.print_exc()
            job_results[job_id] = {"status": "error", "error": "Что-то пошло не так. Попробуй позже.", "position": 0}
        finally:
            job_queue.task_done()


@app.on_event("startup")
async def startup():
    asyncio.create_task(worker())


# ── Основные эндпоинты ─────────────────────────────────────────────────────

@app.get("/user/{username}")
async def get_user_info(username: str):
    username = username.lstrip("@").lower().strip()
    if not re.fullmatch(r"[a-z0-9_]{1,15}", username):
        raise HTTPException(400, "invalid username")
    try:
        user = await get_user(username)
        return {"found": True, "name": user["name"], "screen_name": user["screen_name"], "bio": user["bio"], "followers": user["followers"], "avatar": user.get("avatar", "")}
    except ValueError:
        return {"found": False}
    except Exception:
        raise HTTPException(503, "unavailable")


@app.get("/analyze")
async def enqueue(username: str):
    username = username.lstrip("@").lower().strip()
    if not username:
        raise HTTPException(400, "username required")
    if not re.fullmatch(r"[a-z0-9_]{1,15}", username):
        raise HTTPException(400, "invalid username")

    cached = await get_cached(username)
    if cached:
        return {"verdict": cached, "cached": True, "done": True}

    job_id = str(uuid.uuid4())
    position = job_queue.qsize() + 1
    job_results[job_id] = {"status": "pending", "position": position}
    await job_queue.put((job_id, username))
    return {"job_id": job_id, "position": position, "done": False}


@app.get("/status/{job_id}")
async def status(job_id: str):
    result = job_results.get(job_id)
    if not result:
        raise HTTPException(404, "Job not found")
    return result


# ── Debug эндпоинты ────────────────────────────────────────────────────────

@app.get("/debug")
async def debug_list(x_admin_key: str | None = Header(default=None)):
    _require_admin(x_admin_key)
    return {"cached": store.list_cached()}


@app.get("/debug/{username}")
async def debug_username(username: str, x_admin_key: str | None = Header(default=None)):
    _require_admin(x_admin_key)
    username = username.lstrip("@").lower().strip()
    data = store.load_any(username)
    if not data:
        raise HTTPException(404, "No cached data for this username")
    return data


@app.delete("/cache/{username}")
async def clear_verdict_cache(username: str, x_admin_key: str | None = Header(default=None)):
    _require_admin(x_admin_key)
    username = username.lstrip("@").lower().strip()
    if not re.fullmatch(r"[a-z0-9_]{1,15}", username):
        raise HTTPException(400, "invalid username")
    r = get_redis()
    deleted = await r.delete(f"verdict:{username}")
    return {"ok": True, "username": username, "deleted": bool(deleted)}


# ── Health ─────────────────────────────────────────────────────────────────

_ai_status: str = "unknown"


async def _check_zai() -> str:
    import os
    api_key = os.environ.get("AI_API_KEY")
    if not api_key:
        return "no_key"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.z.ai/api/coding/paas/v4/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": "glm-4.6v", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
                timeout=30.0,
            )
            response.raise_for_status()
            return "ok"
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            return "no_funds"
        if e.response.status_code == 401:
            return "no_key"
        return "unavailable"
    except Exception:
        return "unavailable"


@app.get("/health/ai")
async def health_ai():
    global _ai_status
    if _ai_status == "unknown":
        _ai_status = await _check_zai()
    return {"status": _ai_status}


@app.get("/health")
async def health():
    return {"ok": True, "queue_size": job_queue.qsize()}
