import os
import base64
import httpx

API_KEY = os.environ["AI_API_KEY"]
API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions"
MODEL = "glm-4.6v"

# Порядок важен: длинные фразы раньше коротких, иначе "100% top" поймает раньше "raging top..."
ROLE_TRANSLATIONS = [
    ("raging top that everyone thinks is a bottom", "raging top that everyone thinks is a bottom / волк в шкуре боттома"),
    ("vers with a preference for topping",          "vers with a preference for topping / универсал с уклоном в топ"),
    ("vers that gives bottom energy",               "vers that gives bottom energy / универсал с уклоном в боттом"),
    ("vers that gives top in every way",            "vers that gives top in every way / универсал с энергией топа"),
    ("doesn't have sex",                            "doesn't have sex / нет секса"),
    ("pillow princess",                             "pillow princess / принцесса на подушке"),
    ("bratty bottom",                               "bratty bottom / строптивый боттом"),
    ("power bottom",                                "power bottom / активный боттом"),
    ("power top",                                   "power top / жёсткий топ"),
    ("soft bottom",                                 "soft bottom / нежный боттом"),
    ("soft top",                                    "soft top / нежный топ"),
    ("100% bottom",                                 "100% bottom / чистый боттом"),
    ("100% top",                                    "100% top / чистый топ"),
    ("vers",                                        "vers / универсал"),
]


def localize_verdict(verdict: str) -> str:
    """Заменить английское название роли на 'english / русский' в строке вердикта.
    Ищем только в части после '— ', чтобы не задеть @username.
    Описание выносится на новую строку."""
    sep = " — "
    if sep not in verdict:
        return verdict
    prefix, rest = verdict.split(sep, 1)
    rest_low = rest.lower()
    for eng, bilingual in ROLE_TRANSLATIONS:
        if rest_low.startswith(eng.lower()):
            suffix = rest[len(eng):].lstrip(" .,")
            if suffix:
                return prefix + sep + bilingual + "\n" + suffix
            return prefix + sep + bilingual
    return verdict


async def _image_to_b64(url: str) -> tuple[str, str] | None:
    if "video.twimg.com" in url:
        return None
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(url, timeout=10, follow_redirects=True)
            if r.status_code != 200:
                return None
            content_type = r.headers.get("content-type", "image/jpeg").split(";")[0]
            b64 = base64.standard_b64encode(r.content).decode()
            return content_type, b64
    except Exception:
        return None


async def describe_image(url: str) -> str | None:
    """Describe a single image. Returns text or None on failure."""
    img = await _image_to_b64(url)
    if not img:
        return None
    content_type, b64 = img
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                API_URL,
                headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": MODEL,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{b64}"}},
                            {"type": "text", "text": "Опиши что на этой картинке одним-двумя предложениями. Только описание, без лишних слов."},
                        ],
                    }],
                    "max_tokens": 200,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            msg = data["choices"][0]["message"]
            return msg.get("content", "").strip() or None
    except Exception:
        return None


async def describe_new_images(tweets: list[dict]) -> list[dict]:
    """
    For each tweet, describe any media URLs missing from 'descriptions'.
    Returns tweets with updated 'descriptions' dict (url → text).
    """
    result = []
    for tweet in tweets:
        t = dict(tweet)
        descs = dict(t.get("descriptions", {}))
        for url in t.get("media", []):
            if url not in descs and "video.twimg.com" not in url:
                desc = await describe_image(url)
                if desc:
                    descs[url] = desc
        t["descriptions"] = descs
        result.append(t)
    return result


async def analyze(user: dict, tweets: list[dict]) -> str:
    """
    Build text-only prompt from tweets + cached image descriptions.
    Returns raw LLM output — no parsing, no truncation.
    """
    lines = []
    for t in tweets:
        line = f"[{t['type']}] {t['text']}"
        descs = t.get("descriptions", {})
        for url in t.get("media", []):
            if url in descs:
                line += f"\n  [Картинка: {descs[url]}]"
        lines.append(line)

    tweets_text = "\n".join(lines)

    screen = user["screen_name"]
    prompt = f"""ВАЖНО: отвечай ТОЛЬКО на русском языке. Никакого китайского, английского или других языков в объяснении.

Определи роль человека по шкале топ/боттом на основе его твитов.

Возможные роли (выбери ровно одну, используй точное название):
- 100% top — безоговорочно доминирует, никаких сомнений
- raging top that everyone thinks is a bottom — на деле полный топ, но производит обратное впечатление
- power top — уверенно доминирует, берёт инициативу
- soft top — мягко доминирует, не давит
- vers with a preference for topping — верс, склоняется к топу
- vers — явный микс топ и боттом черт
- vers that gives bottom energy — верс, но больше склоняется к боттому
- bratty bottom — боттом с характером, делает вид что управляет ситуацией
- power bottom — активный боттом, много энергии
- soft bottom — мягко ищет внимания и поддержки
- pillow princess — полностью пассивный боттом, просто лежит и получает
- 100% bottom — безоговорочный боттом, никаких сомнений
- doesn't have sex — нет никаких признаков сексуальной энергии вообще

TOP черты: доминирует, берёт инициативу, assertive, учит, «знает как надо», не просит
BOTTOM черты: ищет внимания, делится переживаниями, emotional, receptive, ждёт одобрения

Аккаунт: @{screen} ({user['name']})
Bio: {user['bio']}

Твиты:
{tweets_text}

ПРИМЕРЫ (точно такой формат — роль на английском + объяснение с конкретным примером из твитов):
@someone — 100% top. Никогда ничего не просит — просто ждёт, и все сами всё понимают.
@someone — pillow princess. Постит только эстетику и ждёт комплиментов — ни одного собственного мнения.
@someone — bratty bottom. Делает вид что командует, но каждый твит заканчивается вопросом «вы же со мной согласны?».
@someone — vers with a preference for topping. Ретвитит чужое, но всегда со своим категоричным комментарием.
@someone — raging top that everyone thinks is a bottom. Постит котиков и эклеры, но стоит кому-то возразить — жёстко ставит на место.

Напиши вердикт для @{screen}. ОБЯЗАТЕЛЬНО: роль + одно предложение с конкретным примером из твитов. Начни с @{screen} —"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            API_URL,
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={
                "model": MODEL,
                "messages": [
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": f"@{screen} —"},
                ],
                "max_tokens": 4000,
            },
            timeout=300.0,
        )
        response.raise_for_status()
        data = response.json()
        msg = data["choices"][0]["message"]

        import re

        content = msg.get("content", "").strip()
        reasoning = msg.get("reasoning_content", "")
        ROLES = [
            "100% top", "raging top that everyone thinks is a bottom", "power top", "soft top",
            "vers with a preference for topping", "vers that gives bottom energy", "vers",
            "bratty bottom", "power bottom", "soft bottom", "pillow princess",
            "100% bottom", "doesn't have sex",
        ]

        def _done(text: str) -> str:
            return localize_verdict(text)

        # С prefill модель продолжает от "@screen —", content = продолжение
        if content and any(r.lower() in content.lower() for r in ROLES):
            first_line = content.split("\n")[0].strip().rstrip(".,;:`*") + "."
            if not first_line.startswith("@"):
                first_line = f"@{screen} — {first_line}"
            return _done(first_line)

        def _find_verdict(text: str) -> str | None:
            """Найти последнее @username — … в тексте, вернуть чистую строку."""
            pattern = rf"@{re.escape(screen)}\s*[—–-]\s*(.+)"
            matches = list(re.finditer(pattern, text, re.IGNORECASE))
            if not matches:
                return None
            for m in reversed(matches):
                body = m.group(1).split("\n")[0].strip()
                body = re.sub(r"`+", "", body).strip()
                body = re.sub(r"^\[(.+?)\]$", r"\1", body)
                if re.fullmatch(r"\[.*?\]", body.strip()):
                    continue
                if not any(r.lower() in body.lower() for r in ROLES):
                    continue
                if any(w in body[:60].lower() for w in ["start with", "choose", "here is", "this is", "follows", "one-line"]):
                    continue
                body = body.rstrip(".,;:*`") + "."
                return f"@{screen} — {body}"
            return None

        v = _find_verdict(content)
        if v:
            return _done(v)

        if content and any(r.lower() in content.lower() for r in ROLES):
            first = content.split("\n")[0].strip().rstrip(".,;:`") + "."
            if 10 < len(first) < 300 and not first.startswith("*"):
                return _done(first)

        v = _find_verdict(reasoning[-500:])
        if v:
            return _done(v)

        v = _find_verdict(reasoning)
        if v:
            return _done(v)

        return reasoning[-200:].strip() or content
