# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\api\report.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from ..deps import get_evaluation_service
from ..engines.audit import export_audit, verify_chain
from ..reporting import generate_phase8_pdf
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


@router.post("/evaluations/{run_id}/export")
def export_run(
    run_id: str,
    service: EvaluationService = Depends(get_evaluation_service),
) -> dict[str, str]:
    try:
        return service.export_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
