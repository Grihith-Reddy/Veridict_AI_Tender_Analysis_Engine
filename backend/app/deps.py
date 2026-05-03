# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\deps.py
from __future__ import annotations

from .services import EvaluationService

_evaluation_service: EvaluationService | None = None


def get_evaluation_service() -> EvaluationService:
    global _evaluation_service
    if _evaluation_service is None:
        _evaluation_service = EvaluationService()
    return _evaluation_service
