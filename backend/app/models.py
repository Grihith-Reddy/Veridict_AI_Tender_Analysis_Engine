from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class CriterionType(str, Enum):
    numeric_threshold = "numeric_threshold"
    semantic_match = "semantic_match"


class Decision(str, Enum):
    ELIGIBLE = "ELIGIBLE"
    NOT_ELIGIBLE = "NOT_ELIGIBLE"
    NEEDS_MANUAL_REVIEW = "NEEDS_MANUAL_REVIEW"


class OfficerFeedbackVerdict(str, Enum):
    agreed = "agreed"
    overridden = "overridden"


class TextBlock(BaseModel):
    id: str
    doc_name: str
    page_number: int
    block_index: int
    text: str
    ocr_confidence: float = Field(ge=0.0, le=1.0)
    extraction_method: str


class CriterionSchema(BaseModel):
    id: str
    description: str
    type: CriterionType
    field: str | None = None
    threshold: float | None = None
    currency: str | None = None
    years_required: int | None = None
    mandatory: bool = False
    legal_keywords_found: list[str] = Field(default_factory=list)
    evidence_sources: list[str] = Field(default_factory=list)
    ambiguous: bool = False


class EvidenceRecord(BaseModel):
    criterion_id: str
    bidder_id: str
    extracted_value: float | str | None = None
    raw_text: str | None = None
    doc_name: str | None = None
    page_number: int | None = None
    ocr_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    extraction_method: str = "none"
    found: bool = False
    semantic_alignment: float = Field(default=0.0, ge=0.0, le=1.0)
    value_clarity: float = Field(default=0.0, ge=0.0, le=1.0)


class EvaluationResult(BaseModel):
    criterion_id: str
    bidder_id: str
    decision: Decision
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str
    soft_flag: bool = False
    evidence: EvidenceRecord


class BidderEvaluation(BaseModel):
    bidder_id: str
    results: list[EvaluationResult]
    overall_decision: Decision
    overall_confidence: float = Field(ge=0.0, le=1.0)
    flags_count: int = 0


class AnomalyReport(BaseModel):
    criterion_id: str
    bidder_ids: list[str]
    anomaly_detected: bool
    reason: str
    details: dict[str, Any] = Field(default_factory=dict)


class EvidenceGraphNode(BaseModel):
    id: str
    type: str
    value: str
    source_reference: str | None = None


class EvidenceGraphEdge(BaseModel):
    from_node: str
    to_node: str


class EvidenceGraph(BaseModel):
    nodes: list[EvidenceGraphNode]
    edges: list[EvidenceGraphEdge]


class AuditEntry(BaseModel):
    step: str
    criterion_id: str | None = None
    bidder_id: str | None = None
    input_hash: str
    previous_hash: str
    entry_hash: str
    output: dict[str, Any]
    timestamp: datetime
    model_used: str


class RunEvaluationResponse(BaseModel):
    run_id: str
    criteria: list[CriterionSchema]
    bidder_evaluations: list[BidderEvaluation]
    anomalies: list[AnomalyReport]
    evidence_graph: EvidenceGraph
    audit_log_path: str


class AmbiguityGateResponse(BaseModel):
    requires_resolution: bool = True
    unresolved_criteria: list[CriterionSchema]
    message: str


class OfficerActionRequest(BaseModel):
    run_id: str
    criterion_id: str
    bidder_id: str
    action: str
    actor: str = "officer"


class OfficerFeedback(BaseModel):
    run_id: str
    criterion_id: str
    bidder_id: str
    verdict: OfficerFeedbackVerdict
    officer_note: str | None = None
    created_at: datetime


class QueryRequest(BaseModel):
    run_id: str
    question: str


class QueryResponse(BaseModel):
    answer: str
    run_id: str
    question: str
