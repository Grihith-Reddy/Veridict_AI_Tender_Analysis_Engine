from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from ..config import settings
from ..gemini_client import gemini_from_openai_style_messages
from ..models import QueryRequest, QueryResponse
from ..repository import RunRepository

router = APIRouter(prefix="/api", tags=["query"])

QUERY_SYSTEM_PROMPT = (
    "You are an analyst assistant for a government tender evaluation system. "
    "The user will ask questions about the evaluation results provided. "
    "Answer in plain English. Be concise and precise. "
    "Reference specific bidder IDs and criterion IDs in your answer."
)


@router.post("/query", response_model=QueryResponse)
def query_results(payload: QueryRequest) -> QueryResponse:
    repo = RunRepository()
    run_payload = repo.get_run_payload(payload.run_id)
    if not run_payload:
        raise HTTPException(status_code=404, detail="run_id not found")

    key = (settings.gemini_api_key or "").strip()
    if not key:
        return QueryResponse(
            answer="Gemini API key is not configured for query answering.",
            run_id=payload.run_id,
            question=payload.question,
        )

    user_prompt = (
        f"Question:\n{payload.question}\n\n"
        "Evaluation Results JSON:\n"
        f"{json.dumps(run_payload, ensure_ascii=False)}"
    )
    try:
        answer = gemini_from_openai_style_messages(
            key,
            model=settings.gemini_model,
            messages=[
                {"role": "system", "content": QUERY_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            json_mode=False,
            timeout=120.0,
        ).strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"query generation failed: {exc}") from exc

    if not answer:
        answer = "No answer generated for this question."
    return QueryResponse(answer=answer, run_id=payload.run_id, question=payload.question)
