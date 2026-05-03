# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\gemini_client.py
"""Google Gemini generateContent (v1beta) via REST — used for criteria extraction, evidence LLM extract, semantic verdict."""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.0-flash"
BASE = "https://generativelanguage.googleapis.com/v1beta"


def _model_path(model: str) -> str:
    m = model.strip()
    return m if m.startswith("models/") else f"models/{m}"


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

    url = f"{BASE}/{_model_path(model)}:generateContent"
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, params={"key": key}, json=body)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500] if exc.response else str(exc)
            logger.warning("Gemini HTTP error: %s", detail)
            raise

    data = resp.json()
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


def gemini_from_openai_style_messages(
    api_key: str,
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.0,
    json_mode: bool = False,
    timeout: float = 120.0,
) -> str:
    """Map OpenAI-style chat messages to a single Gemini call (system → systemInstruction, rest → user blocks)."""
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
