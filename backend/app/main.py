# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\main.py
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    demo_router,
    evaluate_phase8_router,
    evaluate_router,
    feedback_router,
    legacy_upload_router,
    phase8_report_router,
    query_router,
    report_router,
    upload_router,
)
from .config import settings
from .db_models import init_orm_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_orm_db()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*"
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(demo_router)
app.include_router(upload_router)
app.include_router(legacy_upload_router)
app.include_router(evaluate_phase8_router)
app.include_router(evaluate_router)
app.include_router(feedback_router)
app.include_router(query_router)
app.include_router(phase8_report_router)
app.include_router(report_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "veridict-backend"}
