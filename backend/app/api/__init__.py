# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\api\__init__.py
from __future__ import annotations

from .demo import router as demo_router
from .evaluate import phase8_router as evaluate_phase8_router
from .evaluate import router as evaluate_router
from .feedback import router as feedback_router
from .query import router as query_router
from .report import phase8_report_router
from .report import router as report_router
from .upload import legacy_upload_router
from .upload import router as upload_router

__all__ = [
    "demo_router",
    "evaluate_router",
    "evaluate_phase8_router",
    "feedback_router",
    "legacy_upload_router",
    "query_router",
    "report_router",
    "phase8_report_router",
    "upload_router",
]
