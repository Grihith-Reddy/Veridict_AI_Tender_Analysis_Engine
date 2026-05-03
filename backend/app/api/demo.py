# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\api\demo.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..demo_seed import run_demo_bundle

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/seed")
def demo_seed_endpoint() -> dict:
    """Build synthetic CRPF vest tender session, evaluate Phase 8, persist ORM artefacts, expose client-ready payload."""
    try:
        return run_demo_bundle()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"demo seed failed: {exc}") from exc
