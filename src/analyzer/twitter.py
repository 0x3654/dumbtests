import os
import json
import httpx
from urllib.parse import quote

BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

FEATURES_USER = {
    "hidden_profile_subscriptions_enabled": True,
    "rweb_tipjar_consumption_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "subscriptions_verification_info_is_identity_verified_enabled": True,
    "subscriptions_verification_info_verified_since_enabled": True,
    "highlights_tweets_tab_ui_enabled": True,
    "responsive_web_twitter_article_notes_tab_enabled": True,
    "subscriptions_feature_can_gift_premium": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
}

FEATURES_TWEETS = {
    "rweb_tipjar_consumption_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "communities_web_enable_tweet_community_results_fetch": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "articles_preview_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "tweet_awards_web_tipping_enabled": False,
    "creator_subscriptions_quote_tweet_preview_enabled": False,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "rweb_video_timestamps_enabled": True,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": True,
    "responsive_web_enhance_cards_enabled": False,
}


def _headers() -> dict:
    ct0 = os.environ["TWITTER_CT0"]
    auth_token = os.environ["TWITTER_AUTH_TOKEN"]
    return {
        "Authorization": f"Bearer {BEARER}",
        "x-csrf-token": ct0,
        "x-twitter-active-user": "yes",
        "x-twitter-client-language": "en",
        "Cookie": f"auth_token={auth_token}; ct0={ct0}",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://twitter.com/",
        "Accept": "*/*",
    }


async def get_user(screen_name: str) -> dict:
    variables = {"screen_name": screen_name, "withSafetyModeUserFields": True}
    url = (
        "https://twitter.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName"
        f"?variables={quote(json.dumps(variables))}"
        f"&features={quote(json.dumps(FEATURES_USER))}"
    )
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=_headers(), timeout=15)
        r.raise_for_status()

    data = r.json()
    if "data" not in data or "user" not in data["data"]:
        raise ValueError("private_or_not_found")
    result = data["data"]["user"]["result"]
    if result.get("__typename") == "UserUnavailable":
        raise ValueError("private_or_not_found")

    leg = result["legacy"]
    return {
        "id": result["rest_id"],
        "name": leg["name"],
        "screen_name": leg["screen_name"],
        "bio": leg.get("description", ""),
        "followers": leg["followers_count"],
        "avatar": leg.get("profile_image_url_https", ""),
    }


def _extract_media(legacy: dict) -> list[str]:
    urls = []
    for m in legacy.get("extended_entities", {}).get("media", []):
        if m["type"] == "photo":
            urls.append(m["media_url_https"])
        elif m["type"] in ("video", "animated_gif"):
            variants = [
                v for v in m.get("video_info", {}).get("variants", [])
                if v.get("content_type") == "video/mp4"
            ]
            if variants:
                best = max(variants, key=lambda v: v.get("bitrate", 0))
                urls.append(best["url"])
    return urls


async def get_tweets(user_id: str, count: int = 20) -> list[dict]:
    variables = {
        "userId": user_id,
        "count": count,
        "includePromotedContent": False,
        "withVoice": True,
        "withV2Timeline": True,
    }
    url = (
        "https://twitter.com/i/api/graphql/E3opETHurmVJflFsUBVuUQ/UserTweets"
        f"?variables={quote(json.dumps(variables))}"
        f"&features={quote(json.dumps(FEATURES_TWEETS))}"
    )
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=_headers(), timeout=15)
        r.raise_for_status()

    data = r.json()
    tweets = []

    for inst in data["data"]["user"]["result"]["timeline_v2"]["timeline"]["instructions"]:
        if inst.get("type") != "TimelineAddEntries":
            continue
        for entry in inst.get("entries", []):
            if entry.get("entryId", "").startswith("cursor"):
                continue
            try:
                t = entry["content"]["itemContent"]["tweet_results"]["result"]
                legacy = t.get("legacy") or t.get("tweet", {}).get("legacy", {})
                if not legacy:
                    continue

                text = legacy.get("full_text", "")
                tweet_type = "tweet"
                media = _extract_media(legacy)

                rt = legacy.get("retweeted_status_result")
                if rt:
                    rt_result = rt.get("result", {})
                    rt_legacy = rt_result.get("legacy", {})
                    rt_author = (
                        rt_result.get("core", {})
                        .get("user_results", {})
                        .get("result", {})
                        .get("legacy", {})
                        .get("screen_name", "?")
                    )
                    tweet_type = f"RT @{rt_author}"
                    text = rt_legacy.get("full_text", text)
                    if not media:
                        media = _extract_media(rt_legacy)

                qt = t.get("quoted_status_result")
                if qt:
                    qt_result = qt.get("result", {})
                    qt_legacy = qt_result.get("legacy", {})
                    qt_author = (
                        qt_result.get("core", {})
                        .get("user_results", {})
                        .get("result", {})
                        .get("legacy", {})
                        .get("screen_name", "?")
                    )
                    qt_text = qt_legacy.get("full_text", "")
                    tweet_type = f"quote @{qt_author}"
                    text = legacy.get("full_text", "")
                    media = media + _extract_media(qt_legacy)

                tweets.append({
                    "type": tweet_type,
                    "text": text,
                    "media": media[:2],  # max 2 медиа с твита
                })
            except Exception:
                continue

    return tweets[:count]
