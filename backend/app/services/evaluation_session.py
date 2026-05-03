# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\services\evaluation_session.py
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from ..engines.consistency import AnomalyFlag
from ..models import (
    BidderEvaluation,
    CriterionSchema,
    EvidenceGraph,
    EvidenceRecord,
    EvaluationResult,
    TextBlock,
)


@dataclass
class EvaluationSession:
    session_id: str
    tender_id: str
    tender_blocks: list[TextBlock]
    tender_filename: str
    bidder_blocks: dict[str, list[TextBlock]] = field(default_factory=dict)
    criteria: list[CriterionSchema] | None = None
    run_completed: bool = False
    bidder_evaluations: list[BidderEvaluation] = field(default_factory=list)
    all_results: list[EvaluationResult] = field(default_factory=list)
    evidence_by_bidder: dict[str, list[EvidenceRecord]] = field(default_factory=dict)
    anomaly_flags: list[AnomalyFlag] = field(default_factory=list)
    graph: EvidenceGraph | None = None


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, EvaluationSession] = {}

    def create(
        self,
        *,
        tender_blocks: list[TextBlock],
        tender_filename: str,
    ) -> EvaluationSession:
        session_id = str(uuid.uuid4())
        tender_id = f"TDR-{session_id.replace('-', '')[:8].upper()}"
        sess = EvaluationSession(
            session_id=session_id,
            tender_id=tender_id,
            tender_blocks=tender_blocks,
            tender_filename=tender_filename,
        )
        self._sessions[session_id] = sess
        return sess

    def get(self, session_id: str) -> EvaluationSession | None:
        return self._sessions.get(session_id)

    def add_bidder_blocks(self, session_id: str, bidder_id: str, blocks: list[TextBlock]) -> None:
        sess = self._sessions.get(session_id)
        if not sess:
            raise KeyError("session not found")
        sess.bidder_blocks[bidder_id] = blocks


store = SessionStore()
