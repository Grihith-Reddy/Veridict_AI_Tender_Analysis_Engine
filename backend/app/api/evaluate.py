# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\api\evaluate.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..deps import get_evaluation_service
from ..engines import AuditTrail, CriteriaLensEngine
from ..engines.audit import audit_log_path_for_session
from ..models import AmbiguityGateResponse, OfficerActionRequest, RunEvaluationResponse
from ..repository import RunRepository
from ..services import EvaluationService
from ..services.evaluation_session import store
from ..services.phase8_pipeline import run_phase8_evaluation

router = APIRouter(prefix="/api/v1", tags=["evaluate"])

phase8_router = APIRouter(prefix="/api/evaluate", tags=["evaluate-session"])


class Phase8CriteriaRequest(BaseModel):
    session_id: str


class Phase8ResolveRequest(BaseModel):
    session_id: str
    criterion_id: str
    resolved_description: str


class Phase8RunRequest(BaseModel):
    session_id: str


@phase8_router.post("/criteria")
def phase8_extract_criteria(body: Phase8CriteriaRequest):
    sess = store.get(body.session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    eng = CriteriaLensEngine()
    sess.criteria = eng.extract_criteria(sess.tender_blocks)
    ambiguous_count = sum(1 for c in sess.criteria if c.ambiguous)
    return {
        "criteria": [c.model_dump(mode="json") for c in sess.criteria],
        "ambiguous_count": ambiguous_count,
    }


@phase8_router.post("/resolve-ambiguity")
def phase8_resolve_ambiguity(body: Phase8ResolveRequest):
    sess = store.get(body.session_id)
    if not sess or not sess.criteria:
        raise HTTPException(status_code=404, detail="session or criteria not found")
    updated = False
    for c in sess.criteria:
        if c.id == body.criterion_id:
            c.description = body.resolved_description
            c.ambiguous = False
            updated = True
            break
    if not updated:
        raise HTTPException(status_code=404, detail="criterion not found")
    return {"status": "ok", "criterion_id": body.criterion_id}


@phase8_router.post("/run")
def phase8_run(body: Phase8RunRequest):
    sess = store.get(body.session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if not sess.bidder_blocks:
        raise HTTPException(status_code=400, detail="upload at least one bidder document")
    try:
        audit = AuditTrail()
        decisions, flags = run_phase8_evaluation(sess, audit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    repo = RunRepository()
    repo.save_run(
        run_id=body.session_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        payload={
            "run_id": body.session_id,
            "criteria": [c.model_dump(mode="json") for c in (sess.criteria or [])],
            "bidder_evaluations": [b.model_dump(mode="json") for b in sess.bidder_evaluations],
            "anomalies": [f.model_dump(mode="json") for f in flags],
            "evidence_graph": sess.graph.model_dump(mode="json") if sess.graph else None,
            "audit_log_path": str(audit_log_path_for_session(body.session_id)),
        },
    )
    return {
        "decisions": {bid: [d.model_dump(mode="json") for d in lst] for bid, lst in decisions.items()},
        "anomalies": [f.model_dump(mode="json") for f in flags],
    }


@router.post("/evaluations/run", response_model=RunEvaluationResponse | AmbiguityGateResponse)
async def run_evaluation(
    tender_file: Annotated[UploadFile, File(...)],
    bidder_files: Annotated[list[UploadFile], File(...)],
    ambiguity_resolutions: Annotated[str | None, Form()] = None,
    service: EvaluationService = Depends(get_evaluation_service),
):
    parsed_resolutions = None
    if ambiguity_resolutions:
        try:
            parsed_resolutions = json.loads(ambiguity_resolutions)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid ambiguity_resolutions JSON: {exc}") from exc

    try:
        return await service.run(
            tender_file=tender_file,
            bidder_files=bidder_files,
            ambiguity_resolutions=parsed_resolutions,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/officer-actions")
def log_officer_action(
    payload: OfficerActionRequest,
    service: EvaluationService = Depends(get_evaluation_service),
) -> dict[str, str]:
    service.log_officer_action(
        run_id=payload.run_id,
        criterion_id=payload.criterion_id,
        bidder_id=payload.bidder_id,
        action=payload.action,
        actor=payload.actor,
    )
    return {"status": "logged"}
