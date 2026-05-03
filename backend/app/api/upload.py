# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\api\upload.py
from __future__ import annotations

import re
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..engines import IngestionEngine
from ..services.evaluation_session import store

router = APIRouter(prefix="/api/upload", tags=["upload"])

legacy_upload_router = APIRouter(prefix="/api/v1/uploads", tags=["uploads"])


@legacy_upload_router.get("/info")
def upload_info() -> dict[str, str]:
    return {
        "combined_endpoint": "/api/v1/evaluations/run",
        "phase8_tender": "/api/upload/tender",
        "phase8_bidder": "/api/upload/bidder",
    }


def _slug_bidder(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", (name or "").strip())
    return (s[:64] if s else "") or f"B-{uuid.uuid4().hex[:6]}"


@router.post("/tender")
async def upload_tender(file: Annotated[UploadFile, File(...)]):
    content = await file.read()
    eng = IngestionEngine()
    fname = file.filename or "tender.pdf"
    blocks = eng.ingest_file_bytes(file_name=fname, content=content)
    sess = store.create(tender_blocks=blocks, tender_filename=fname)
    page_nums = {b.page_number for b in blocks}
    pages = len(page_nums) if page_nums else (1 if blocks else 0)
    return {
        "session_id": sess.session_id,
        "tender_id": sess.tender_id,
        "block_count": len(blocks),
        "pages": pages,
    }


@router.post("/bidder")
async def upload_bidder(
    file: Annotated[UploadFile, File(...)],
    session_id: Annotated[str, Form(...)],
    bidder_name: Annotated[str, Form(...)],
):
    sess = store.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    content = await file.read()
    eng = IngestionEngine()
    fname = file.filename or "bidder.pdf"
    blocks = eng.ingest_file_bytes(file_name=fname, content=content)
    bidder_id = _slug_bidder(bidder_name)
    if bidder_id in sess.bidder_blocks:
        bidder_id = f"{bidder_id}_{uuid.uuid4().hex[:4]}"
    store.add_bidder_blocks(session_id, bidder_id, blocks)
    return {"bidder_id": bidder_id, "block_count": len(blocks)}
