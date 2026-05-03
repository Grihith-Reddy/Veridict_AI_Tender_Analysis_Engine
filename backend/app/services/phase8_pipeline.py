# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\services\phase8_pipeline.py
from __future__ import annotations

from collections import defaultdict

from ..config import settings
from ..engines import (
    AuditTrail,
    DocProbeEngine,
    EvidenceGraphEngine,
    VerdictCoreEngine,
)
from ..engines.consistency import AnomalyFlag, run_consistency_check
from ..engines.verdict_core import VerdictDecision
from ..models import EvaluationResult, EvidenceRecord
from .evaluation_service import EvaluationService
from .evaluation_session import EvaluationSession


def _results_to_verdicts(results: list[EvaluationResult]) -> list[VerdictDecision]:
    return [
        VerdictDecision(
            criterion_id=r.criterion_id,
            bidder_id=r.bidder_id,
            decision=r.decision,
            confidence=r.confidence,
            reasoning=r.reason,
            evidence=r.evidence,
        )
        for r in results
    ]


def run_phase8_evaluation(session: EvaluationSession, audit: AuditTrail) -> tuple[dict[str, list[VerdictDecision]], list[AnomalyFlag]]:
    criteria = session.criteria
    if not criteria:
        raise ValueError("Criteria not extracted; call /api/evaluate/criteria first.")
    if any(c.ambiguous for c in criteria):
        raise ValueError("All criteria must have ambiguous=false before run.")

    doc = DocProbeEngine()
    verdict = VerdictCoreEngine()
    graph_eng = EvidenceGraphEngine()

    audit.begin_session(session.session_id)

    all_results: list[EvaluationResult] = []
    evidence_by_bidder: dict[str, list[EvidenceRecord]] = {}
    bidder_evals = []

    for bidder_id, bidder_blocks in session.bidder_blocks.items():
        evidence_records = doc.probe_bidder(bidder_id=bidder_id, bidder_blocks=bidder_blocks, criteria=criteria)
        evidence_by_bidder[bidder_id] = evidence_records
        audit.write(
            step="DocProbeEngine.probe_bidder",
            bidder_id=bidder_id,
            output={"evidence_records": len(evidence_records)},
            model_used="deterministic",
            input_obj={"criteria": len(criteria), "blocks": len(bidder_blocks)},
        )
        bidder_results = []
        for criterion, evidence in zip(criteria, evidence_records):
            result = verdict.evaluate(criterion=criterion, evidence=evidence)
            bidder_results.append(result)
            all_results.append(result)
            audit.write(
                step="VerdictCore.evaluate",
                bidder_id=bidder_id,
                criterion_id=criterion.id,
                output={"decision": result.decision.value, "confidence": result.confidence},
                model_used=settings.gemini_model if settings.gemini_api_key else "fallback_parser",
                input_obj={"evidence": evidence.model_dump()},
            )
        bidder_eval = EvaluationService._aggregate_bidder_result(bidder_id, bidder_results)
        bidder_evals.append(bidder_eval)

    cid_order = {c.id: i for i, c in enumerate(criteria)}
    by_bidder: dict[str, list[EvaluationResult]] = defaultdict(list)
    for r in all_results:
        by_bidder[r.bidder_id].append(r)
    for bid in by_bidder:
        by_bidder[bid].sort(key=lambda x: cid_order.get(x.criterion_id, 999))

    flags = run_consistency_check(dict(by_bidder), evidence_by_bidder, criteria)

    for be in bidder_evals:
        if be.results:
            be.overall_confidence = sum(r.confidence for r in be.results) / len(be.results)

    audit.write(
        step="ConsistencyEngine.run",
        output={"anomalies": len(flags)},
        model_used=settings.gemini_model if settings.gemini_api_key else "deterministic",
        input_obj={"results_count": len(all_results)},
    )

    graph = graph_eng.build(all_results)
    audit.write(
        step="EvidenceGraphEngine.build",
        output={"nodes": len(graph.nodes), "edges": len(graph.edges)},
        model_used="deterministic",
        input_obj={"results_count": len(all_results)},
    )

    session.all_results = all_results
    session.evidence_by_bidder = evidence_by_bidder
    session.bidder_evaluations = bidder_evals
    session.anomaly_flags = flags
    session.graph = graph
    session.run_completed = True

    decisions: dict[str, list[VerdictDecision]] = {}
    for bidder_id in session.bidder_blocks:
        decisions[bidder_id] = _results_to_verdicts([r for r in all_results if r.bidder_id == bidder_id])

    return decisions, flags
