from __future__ import annotations

from fastapi import APIRouter

from ..engines import AuditTrail
from ..models import OfficerFeedback
from ..repository import RunRepository

router = APIRouter(prefix="/api", tags=["feedback"])


@router.post("/feedback")
def submit_feedback(payload: OfficerFeedback) -> dict[str, str]:
    repo = RunRepository()
    audit = AuditTrail()
    audit.begin_session(payload.run_id)
    repo.save_officer_feedback(
        run_id=payload.run_id,
        criterion_id=payload.criterion_id,
        bidder_id=payload.bidder_id,
        verdict=payload.verdict.value,
        officer_note=payload.officer_note,
        created_at=payload.created_at.isoformat(),
    )
    audit.write(
        step="OfficerFeedback.submit",
        criterion_id=payload.criterion_id,
        bidder_id=payload.bidder_id,
        output={
            "run_id": payload.run_id,
            "verdict": payload.verdict.value,
            "officer_note": payload.officer_note,
            "created_at": payload.created_at.isoformat(),
        },
        model_used="human_decision",
        input_obj={"run_id": payload.run_id},
    )
    return {"status": "logged"}
