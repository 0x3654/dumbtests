import json
import time
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path("/data")


def _path(username: str) -> Path:
    return DATA_DIR / f"{username.lower()}.json"


def get_tweet_cache(username: str, max_age_hours: int = 12) -> dict | None:
    """Return cached tweet data if fresh (< max_age_hours), else None."""
    p = _path(username)
    if not p.exists():
        return None
    if time.time() - p.stat().st_mtime > max_age_hours * 3600:
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def save_tweet_cache(username: str, data: dict):
    """Save tweet data (user + tweets + descriptions) to file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = dict(data)
    data["saved_at"] = datetime.now(timezone.utc).isoformat()
    _path(username).write_text(json.dumps(data, ensure_ascii=False, indent=2))


def load_any(username: str) -> dict | None:
    """Load cache regardless of age (for debug)."""
    p = _path(username)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def list_cached() -> list[dict]:
    """List all cached usernames with age info."""
    if not DATA_DIR.exists():
        return []
    result = []
    for p in sorted(DATA_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            age_h = (time.time() - p.stat().st_mtime) / 3600
            result.append({"username": p.stem, "age_hours": round(age_h, 1)})
        except Exception:
            pass
    return result
