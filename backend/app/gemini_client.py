# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\gemini_client.py
"""Google Gemini generateContent (v1beta) REST client with retry and pacing."""
from __future__ import annotations

import logging
import random
import threading
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from .config import settings

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.0-flash"
BASE = "https://generativelanguage.googleapis.com/v1beta"
RETRYABLE_HTTP_STATUS = {408, 429, 500, 502, 503, 504}

_THROTTLE_LOCK = threading.Lock()
_NEXT_ALLOWED_TS = 0.0


def _model_path(model: str) -> str:
    m = model.strip()
    return m if m.startswith("models/") else f"models/{m}"


def _extract_error_message(resp: httpx.Response) -> str:
    try:
        payload = resp.json()
    except Exception:
        payload = None

    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            msg = error_obj.get("message")
            if msg:
                return str(msg)

    text = (resp.text or "").strip()
    if text:
        return text[:500]
    return f"HTTP {resp.status_code}"


def _parse_retry_after_seconds(value: str | None) -> float | None:
    raw = (value or "").strip()
    if not raw:
        return None

    try:
        seconds = float(raw)
        return max(0.0, seconds)
    except ValueError:
        pass

    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = (dt - datetime.now(timezone.utc)).total_seconds()
        return max(0.0, delta)
    except Exception:
        return None


def _backoff_delay_seconds(attempt_index: int, initial_s: float, max_s: float) -> float:
    if initial_s <= 0:
        return 0.0
    capped_max = max(initial_s, max_s)
    base = min(initial_s * (2 ** max(0, attempt_index - 1)), capped_max)
    jitter = random.uniform(0.0, min(1.0, base * 0.25))
    return base + jitter


def _throttle(min_interval_s: float) -> None:
    if min_interval_s <= 0:
        return

    global _NEXT_ALLOWED_TS
    wait_s = 0.0
    with _THROTTLE_LOCK:
        now = time.monotonic()
        wait_s = max(0.0, _NEXT_ALLOWED_TS - now)
        scheduled = max(now, _NEXT_ALLOWED_TS) + min_interval_s
        _NEXT_ALLOWED_TS = scheduled
    if wait_s > 0:
        time.sleep(wait_s)


def gemini_generate_text(
    api_key: str,
    *,
    model: str,
    system_instruction: str | None = None,
    user_prompt: str,
    temperature: float = 0.0,
    json_mode: bool = False,
    timeout: float = 120.0,
) -> str:
    key = (api_key or "").strip()
    if not key:
        raise ValueError("empty Gemini API key")

    body: dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"

    retries = max(0, int(settings.gemini_max_retries))
    backoff_initial = max(0.0, float(settings.gemini_backoff_initial_s))
    backoff_max = max(0.0, float(settings.gemini_backoff_max_s))
    min_interval = max(0.0, float(settings.gemini_min_interval_s))

    url = f"{BASE}/{_model_path(model)}:generateContent"
    total_attempts = retries + 1

    for attempt in range(1, total_attempts + 1):
        _throttle(min_interval)
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(url, params={"key": key}, json=body)
        except httpx.TimeoutException as exc:
            if attempt >= total_attempts:
                raise RuntimeError(
                    f"Gemini timeout after {total_attempts} attempts: {exc.__class__.__name__}"
                ) from exc
            delay = _backoff_delay_seconds(attempt, backoff_initial, backoff_max)
            logger.warning(
                "Gemini timeout (attempt %s/%s). Retrying in %.2fs.",
                attempt,
                total_attempts,
                delay,
            )
            if delay > 0:
                time.sleep(delay)
            continue
        except httpx.RequestError as exc:
            if attempt >= total_attempts:
                raise RuntimeError(
                    f"Gemini network request failed after {total_attempts} attempts: "
                    f"{exc.__class__.__name__}"
                ) from exc
            delay = _backoff_delay_seconds(attempt, backoff_initial, backoff_max)
            logger.warning(
                "Gemini request error (attempt %s/%s). Retrying in %.2fs. error=%s",
                attempt,
                total_attempts,
                delay,
                exc.__class__.__name__,
            )
            if delay > 0:
                time.sleep(delay)
            continue

        if resp.status_code >= 400:
            status = resp.status_code
            message = _extract_error_message(resp)

            if status in RETRYABLE_HTTP_STATUS and attempt < total_attempts:
                retry_after = _parse_retry_after_seconds(resp.headers.get("Retry-After"))
                backoff_delay = _backoff_delay_seconds(attempt, backoff_initial, backoff_max)
                delay = retry_after if retry_after is not None else backoff_delay
                logger.warning(
                    "Gemini HTTP %s (attempt %s/%s). Retrying in %.2fs. message=%s",
                    status,
                    attempt,
                    total_attempts,
                    delay,
                    message[:250],
                )
                if delay > 0:
                    time.sleep(delay)
                continue

            logger.warning("Gemini HTTP error status=%s message=%s", status, message[:250])
            raise RuntimeError(f"Gemini API error {status}: {message}")

        try:
            data = resp.json()
        except Exception as exc:
            raise RuntimeError("Gemini API returned invalid JSON response") from exc

        candidates = data.get("candidates") or []
        if not candidates:
            raise ValueError(f"Gemini returned no candidates: {data!r}")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        if not parts:
            raise ValueError(f"Gemini empty content: {data!r}")
        text = parts[0].get("text")
        if text is None:
            raise ValueError(f"Gemini part missing text: {data!r}")
        return str(text)

    raise RuntimeError("Gemini request failed after retries")


def gemini_from_openai_style_messages(
    api_key: str,
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.0,
    json_mode: bool = False,
    timeout: float = 120.0,
) -> str:
    """Map OpenAI-style chat messages to one Gemini call."""
    sys_chunks: list[str] = []
    user_chunks: list[str] = []
    for m in messages:
        role = (m.get("role") or "user").strip()
        content = m.get("content") or ""
        if role == "system":
            sys_chunks.append(content)
        else:
            user_chunks.append(content)
    system_instruction = "\n\n".join(sys_chunks) if sys_chunks else None
    user_prompt = "\n\n---\n\n".join(user_chunks) if user_chunks else ""
    return gemini_generate_text(
        api_key,
        model=model,
        system_instruction=system_instruction,
        user_prompt=user_prompt,
        temperature=temperature,
        json_mode=json_mode,
        timeout=timeout,
    )
