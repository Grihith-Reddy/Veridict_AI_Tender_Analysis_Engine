from __future__ import annotations

import json
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile

from ..config import settings
from ..engines import (
    AuditTrail,
    ConsistencyEngine,
    CriteriaLensEngine,
    DocProbeEngine,
    EvidenceGraphEngine,
    IngestionEngine,
    VerdictCoreEngine,
)
from ..engines.audit import audit_log_path_for_session
from ..models import (
    AnomalyReport,
    AmbiguityGateResponse,
    BidderEvaluation,
    CriterionSchema,
    Decision,
    EvaluationResult,
    EvidenceRecord,
    RunEvaluationResponse,
)
from ..reporting import export_anomalies, export_evidence_graph, generate_bidder_pdf, generate_matrix_excel
from ..repository import RunRepository


@dataclass
class StoredRun:
    run_id: str
    criteria: list[CriterionSchema]
    bidder_evaluations: list[BidderEvaluation]
    anomalies: list[AnomalyReport]
    audit_log_path: Path


class RunStore:
    def __init__(self) -> None:
        self._runs: dict[str, StoredRun] = {}

    def save(self, run: StoredRun) -> None:
        self._runs[run.run_id] = run

    def get(self, run_id: str) -> StoredRun | None:
        return self._runs.get(run_id)


class EvaluationService:
    def __init__(self) -> None:
        self.ingestion_engine = IngestionEngine()
        self.criteria_engine = CriteriaLensEngine()
        self.docprobe_engine = DocProbeEngine()
        self.verdict_engine = VerdictCoreEngine()
        self.consistency_engine = ConsistencyEngine()
        self.graph_engine = EvidenceGraphEngine()
        self.audit = AuditTrail()
        self.store = RunStore()
        self.repo = RunRepository()

    async def run(
        self,
        *,
        tender_file: UploadFile,
        bidder_files: list[UploadFile],
        ambiguity_resolutions: dict[str, bool] | None,
    ) -> RunEvaluationResponse | AmbiguityGateResponse:
        run_id = f"RUN-{uuid.uuid4().hex[:10]}"
        self.audit.begin_session(run_id)

        tender_bytes = await tender_file.read()
        tender_blocks = self.ingestion_engine.ingest_file_bytes(file_name=tender_file.filename or "tender.pdf", content=tender_bytes)
        self.audit.write(
            step="IngestionEngine.ingest_tender",
            output={"blocks": len(tender_blocks)},
            model_used="deterministic",
            input_obj={"file": tender_file.filename},
        )

        criteria = self.criteria_engine.extract_criteria(tender_blocks)
        self.audit.write(
            step="CriteriaLensEngine.extract",
            output={"criteria": len(criteria)},
            model_used=settings.gemini_model if settings.gemini_api_key else "fallback_parser",
            input_obj={"tender_blocks": len(tender_blocks)},
        )

        unresolved = [c for c in criteria if c.ambiguous and not (ambiguity_resolutions or {}).get(c.id, False)]
        if unresolved:
            return AmbiguityGateResponse(
                unresolved_criteria=unresolved,
                message="Resolve all ambiguous criteria before starting evaluation.",
            )

        files_by_bidder = await self._group_files_by_bidder(bidder_files)
        all_results: list[EvaluationResult] = []
        bidder_evals: list[BidderEvaluation] = []
        evidence_by_bidder: dict[str, list[EvidenceRecord]] = {}
        for bidder_id, docs in files_by_bidder.items():
            bidder_blocks = []
            for doc in docs:
                content = await doc.read()
                blocks = self.ingestion_engine.ingest_file_bytes(file_name=doc.filename or "document.pdf", content=content)
                bidder_blocks.extend(blocks)
            self.audit.write(
                step="IngestionEngine.ingest_bidder_docs",
                bidder_id=bidder_id,
                output={"blocks": len(bidder_blocks)},
                model_used="deterministic",
                input_obj={"docs": [d.filename for d in docs]},
            )

            evidence_records = self.docprobe_engine.probe_bidder(bidder_id=bidder_id, bidder_blocks=bidder_blocks, criteria=criteria)
            evidence_by_bidder[bidder_id] = evidence_records
            bidder_results = []
            for criterion, evidence in zip(criteria, evidence_records):
                result = self.verdict_engine.evaluate(criterion=criterion, evidence=evidence)
                bidder_results.append(result)
                all_results.append(result)
                self.audit.write(
                    step="VerdictCore.evaluate",
                    bidder_id=bidder_id,
                    criterion_id=criterion.id,
                    output={"decision": result.decision.value, "confidence": result.confidence},
                    model_used=settings.gemini_model if settings.gemini_api_key else "fallback_parser",
                    input_obj={"evidence": evidence.model_dump()},
                )

            bidder_eval = self._aggregate_bidder_result(bidder_id, bidder_results)
            bidder_evals.append(bidder_eval)

        anomalies = self.consistency_engine.run(
            all_results,
            criteria=criteria,
            evidence_by_bidder=evidence_by_bidder,
        )
        for be in bidder_evals:
            if be.results:
                be.overall_confidence = sum(r.confidence for r in be.results) / len(be.results)
        self.audit.write(
            step="ConsistencyEngine.run",
            output={"anomalies": len(anomalies)},
            model_used=settings.gemini_model if settings.gemini_api_key else "deterministic",
            input_obj={"results_count": len(all_results)},
        )

        graph = self.graph_engine.build(all_results)
        self.audit.write(
            step="EvidenceGraphEngine.build",
            output={"nodes": len(graph.nodes), "edges": len(graph.edges)},
            model_used="deterministic",
            input_obj={"results_count": len(all_results)},
        )

        created_at = datetime.now(timezone.utc).isoformat()
        audit_path = audit_log_path_for_session(run_id)
        stored = StoredRun(
            run_id=run_id,
            criteria=criteria,
            bidder_evaluations=bidder_evals,
            anomalies=anomalies,
            audit_log_path=audit_path,
        )
        self.store.save(stored)
        self.repo.save_run(
            run_id=run_id,
            created_at=created_at,
            payload={
                "run_id": run_id,
                "criteria": [c.model_dump() for c in criteria],
                "bidder_evaluations": [b.model_dump() for b in bidder_evals],
                "anomalies": [a.model_dump() for a in anomalies],
                "audit_log_path": str(audit_path),
            },
        )

        return RunEvaluationResponse(
            run_id=run_id,
            criteria=criteria,
            bidder_evaluations=bidder_evals,
            anomalies=anomalies,
            evidence_graph=graph,
            audit_log_path=str(audit_path),
        )

    async def _group_files_by_bidder(self, bidder_files: list[UploadFile]) -> dict[str, list[UploadFile]]:
        grouped: dict[str, list[UploadFile]] = defaultdict(list)
        for f in bidder_files:
            name = f.filename or "UNKNOWN__document"
            if "__" in name:
                bidder_id, _ = name.split("__", 1)
            else:
                bidder_id = "B-UNKNOWN"
            grouped[bidder_id].append(f)
        return grouped

    def export_run(self, run_id: str) -> dict[str, str]:
        run = self.store.get(run_id)
        if not run:
            payload = self.repo.get_run_payload(run_id)
            if not payload:
                raise KeyError("run_id not found")
            run = StoredRun(
                run_id=payload["run_id"],
                criteria=[CriterionSchema.model_validate(c) for c in payload["criteria"]],
                bidder_evaluations=[BidderEvaluation.model_validate(b) for b in payload["bidder_evaluations"]],
                anomalies=[AnomalyReport.model_validate(a) for a in payload["anomalies"]],
                audit_log_path=Path(payload["audit_log_path"]),
            )

        base = settings.storage_dir / "exports" / run_id
        base.mkdir(parents=True, exist_ok=True)
        pdf_dir = base / "bidder_pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)

        for bidder in run.bidder_evaluations:
            generate_bidder_pdf(
                bidder_evaluation=bidder,
                criteria=run.criteria,
                output_path=pdf_dir / f"{bidder.bidder_id}_decision_sheet.pdf",
            )

        matrix = generate_matrix_excel(
            bidder_evaluations=run.bidder_evaluations,
            output_path=base / "bidder_matrix.xlsx",
        )
        anomalies = export_anomalies(run.anomalies, base / "anomalies.json")
        evidence_graph = export_evidence_graph(
            self.graph_engine.build(
                [result for bidder in run.bidder_evaluations for result in bidder.results]
            ),
            base / "evidence_graph.json",
        )
        manifest = {
            "pdf_dir": str(pdf_dir),
            "matrix_excel": str(matrix),
            "anomalies_json": str(anomalies),
            "evidence_graph_json": str(evidence_graph),
            "audit_log": str(run.audit_log_path),
        }
        (base / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    def log_officer_action(
        self, *, run_id: str, criterion_id: str, bidder_id: str, action: str, actor: str = "officer"
    ) -> None:
        self.audit.begin_session(run_id)
        ts = datetime.now(timezone.utc).isoformat()
        self.repo.save_officer_action(
            run_id=run_id,
            criterion_id=criterion_id,
            bidder_id=bidder_id,
            action=action,
            actor=actor,
            created_at=ts,
        )
        self.audit.write(
            step="OfficerAction.log",
            criterion_id=criterion_id,
            bidder_id=bidder_id,
            output={"action": action, "actor": actor, "run_id": run_id},
            model_used="human_decision",
            input_obj={"run_id": run_id},
        )

    @staticmethod
    def _aggregate_bidder_result(bidder_id: str, results: list[EvaluationResult]) -> BidderEvaluation:
        if not results:
            return BidderEvaluation(
                bidder_id=bidder_id,
                results=[],
                overall_decision=Decision.NEEDS_MANUAL_REVIEW,
                overall_confidence=0.0,
                flags_count=0,
            )

        flags_count = sum(1 for r in results if r.decision == Decision.NEEDS_MANUAL_REVIEW or r.soft_flag)
        if any(r.decision == Decision.NOT_ELIGIBLE for r in results):
            overall = Decision.NOT_ELIGIBLE
        elif any(r.decision == Decision.NEEDS_MANUAL_REVIEW for r in results):
            overall = Decision.NEEDS_MANUAL_REVIEW
        else:
            overall = Decision.ELIGIBLE

        confidence = sum(r.confidence for r in results) / len(results)
        return BidderEvaluation(
            bidder_id=bidder_id,
            results=results,
            overall_decision=overall,
            overall_confidence=confidence,
            flags_count=flags_count,
        )
