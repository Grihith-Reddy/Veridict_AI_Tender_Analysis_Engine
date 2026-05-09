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


def _compact_run_payload(run_payload: dict) -> dict:
    criteria = []
    for c in run_payload.get("criteria", []):
        if not isinstance(c, dict):
            continue
        criteria.append(
            {
                "id": c.get("id"),
                "description": c.get("description"),
                "type": c.get("type"),
                "threshold": c.get("threshold"),
                "currency": c.get("currency"),
                "mandatory": c.get("mandatory"),
            }
        )

    bidder_evaluations = []
    for bidder in run_payload.get("bidder_evaluations", []):
        if not isinstance(bidder, dict):
            continue
        compact_results = []
        for r in bidder.get("results", []):
            if not isinstance(r, dict):
                continue
            ev = r.get("evidence") or {}
            compact_results.append(
                {
                    "criterion_id": r.get("criterion_id"),
                    "decision": r.get("decision"),
                    "confidence": r.get("confidence"),
                    "reason": r.get("reason"),
                    "evidence": {
                        "found": ev.get("found"),
                        "extracted_value": ev.get("extracted_value"),
                        "doc_name": ev.get("doc_name"),
                        "page_number": ev.get("page_number"),
                        "extraction_method": ev.get("extraction_method"),
                    },
                }
            )
        bidder_evaluations.append(
            {
                "bidder_id": bidder.get("bidder_id"),
                "overall_decision": bidder.get("overall_decision"),
                "overall_confidence": bidder.get("overall_confidence"),
                "flags_count": bidder.get("flags_count"),
                "results": compact_results,
            }
        )

    anomalies = []
    for a in run_payload.get("anomalies", []):
        if isinstance(a, dict):
            anomalies.append(a)

    return {
        "run_id": run_payload.get("run_id"),
        "criteria": criteria,
        "bidder_evaluations": bidder_evaluations,
        "anomalies": anomalies,
    }


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

    compact_payload = _compact_run_payload(run_payload)
    user_prompt = (
        f"Question:\n{payload.question}\n\n"
        "Evaluation Results JSON:\n"
        f"{json.dumps(compact_payload, ensure_ascii=False)}"
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
        msg = str(exc)
        if "429" in msg or "resource exhausted" in msg.lower():
            raise HTTPException(
                status_code=503,
                detail="query generation is temporarily rate-limited by Gemini. Please retry shortly.",
            ) from exc
        raise HTTPException(status_code=502, detail=f"query generation failed: {msg}") from exc

    if not answer:
        answer = "No answer generated for this question."
    return QueryResponse(answer=answer, run_id=payload.run_id, question=payload.question)
