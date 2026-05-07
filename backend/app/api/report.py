# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\api\report.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response

from ..config import settings
from ..deps import get_evaluation_service
from ..engines.audit import export_audit, verify_chain
from ..models import BidderEvaluation, CriterionSchema
from ..reporting import generate_bidder_pdf, generate_phase8_pdf
from ..repository import RunRepository
from ..services import EvaluationService
from ..services.evaluation_session import store

router = APIRouter(prefix="/api/v1", tags=["report"])

phase8_report_router = APIRouter(prefix="/api/report", tags=["report-session"])


@phase8_report_router.get("/{session_id}")
def phase8_report_json(session_id: str):
    sess = store.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    return {
        "session_id": sess.session_id,
        "tender_id": sess.tender_id,
        "tender_filename": sess.tender_filename,
        "criteria": [c.model_dump(mode="json") for c in (sess.criteria or [])],
        "bidders": list(sess.bidder_blocks.keys()),
        "run_completed": sess.run_completed,
        "bidder_evaluations": [b.model_dump(mode="json") for b in sess.bidder_evaluations],
        "anomalies": [f.model_dump(mode="json") for f in sess.anomaly_flags],
        "evidence_graph": sess.graph.model_dump(mode="json") if sess.graph else None,
    }


@phase8_report_router.get("/{session_id}/audit")
def phase8_report_audit(session_id: str):
    if not store.get(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    entries = [e.model_dump(mode="json") for e in export_audit(session_id)]
    return {"entries": entries, "chain_valid": verify_chain(session_id)}


@phase8_report_router.get("/{session_id}/pdf")
def phase8_report_pdf(session_id: str):
    sess = store.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if not sess.run_completed:
        raise HTTPException(status_code=400, detail="evaluation not run yet")
    buf = generate_phase8_pdf(sess)
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="veridict_{session_id}.pdf"'},
    )


@phase8_report_router.get("/{run_id}/bidder/{bidder_id}/pdf")
def phase8_bidder_report_pdf(run_id: str, bidder_id: str):
    repo = RunRepository()
    payload = repo.get_run_payload(run_id)
    if not payload:
        raise HTTPException(status_code=404, detail="run_id not found")

    criteria_raw = payload.get("criteria")
    bidder_evaluations_raw = payload.get("bidder_evaluations")
    if not isinstance(criteria_raw, list) or not isinstance(bidder_evaluations_raw, list):
        raise HTTPException(status_code=404, detail="run_id payload invalid")

    criteria = [CriterionSchema.model_validate(c) for c in criteria_raw]
    bidder_eval: BidderEvaluation | None = None
    for raw in bidder_evaluations_raw:
        candidate = BidderEvaluation.model_validate(raw)
        if candidate.bidder_id == bidder_id:
            bidder_eval = candidate
            break
    if bidder_eval is None:
        raise HTTPException(status_code=404, detail="bidder_id not found")

    output_path = settings.storage_dir / "reports" / run_id / f"veridict_{bidder_id}_report.pdf"
    pdf_path = generate_bidder_pdf(
        bidder_evaluation=bidder_eval,
        criteria=criteria,
        output_path=output_path,
        run_id=run_id,
    )
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"veridict_{bidder_id}_report.pdf",
    )


@router.post("/evaluations/{run_id}/export")
def export_run(
    run_id: str,
    service: EvaluationService = Depends(get_evaluation_service),
) -> dict[str, str]:
    try:
        return service.export_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
