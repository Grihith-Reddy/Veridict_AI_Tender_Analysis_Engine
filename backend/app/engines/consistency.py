# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\engines\consistency.py
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from typing import TypeAlias

from pydantic import BaseModel, Field

from ..models import AnomalyReport, CriterionSchema, CriterionType, EvaluationResult, EvidenceRecord
from .verdict_core import VerdictDecision

logger = logging.getLogger(__name__)

DecisionLike: TypeAlias = VerdictDecision | EvaluationResult


class AnomalyFlag(BaseModel):
    criterion_id: str
    bidder_ids: list[str]
    anomaly_type: str
    description: str
    severity: str = Field(description="high or medium")


# ── Pure Python percentile — no numpy/scipy needed ────────────────────────────
def _percentile(data: list[float], pct: float) -> float:
    s = sorted(data)
    if not s:
        return 0.0
    k = (len(s) - 1) * pct / 100.0
    f = int(k)
    c = f + 1
    if c >= len(s):
        return float(s[-1])
    return float(s[f]) + (float(s[c]) - float(s[f])) * (k - f)


def _normalize_doc_pattern(doc_name: str) -> str:
    name = doc_name.lower()
    if "balance" in name:
        return "balance_sheet"
    if "tax" in name or "itr" in name:
        return "tax_filing"
    if "declaration" in name or "self" in name:
        return "self_declaration"
    if "certificate" in name:
        return "certificate"
    return "other"


def _evidence_source_pattern(ev: EvidenceRecord) -> str:
    doc = ev.doc_name or ""
    return f"{ev.extraction_method}|{_normalize_doc_pattern(doc)}"


def _set_confidence(d: DecisionLike, value: float) -> None:
    d.confidence = max(0.0, min(1.0, value))


def _numeric_outliers(
    criterion: CriterionSchema,
    all_evidence: dict[str, list[EvidenceRecord]],
) -> list[AnomalyFlag]:
    if criterion.type != CriterionType.numeric_threshold:
        return []

    pairs: list[tuple[str, float]] = []
    for bidder_id, evs in all_evidence.items():
        ev = next((e for e in evs if e.criterion_id == criterion.id and e.found), None)
        if ev is None or not isinstance(ev.extracted_value, (int, float)):
            continue
        pairs.append((bidder_id, float(ev.extracted_value)))

    if len(pairs) < 3:
        return []

    values = [v for _, v in pairs]
    q1 = _percentile(values, 25)
    q3 = _percentile(values, 75)
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr

    outlier_ids = sorted({bid for bid, v in pairs if v < lower or v > upper})
    if not outlier_ids:
        return []

    return [
        AnomalyFlag(
            criterion_id=criterion.id,
            bidder_ids=outlier_ids,
            anomaly_type="outlier_value",
            description=(
                f"Numeric values outside Tukey bounds "
                f"[{lower:.4g}, {upper:.4g}] (IQR-based)."
            ),
            severity="high",
        )
    ]


def _document_pattern_mismatch(
    criterion: CriterionSchema,
    all_evidence: dict[str, list[EvidenceRecord]],
) -> list[AnomalyFlag]:
    entries: list[tuple[str, str]] = []
    for bidder_id, evs in all_evidence.items():
        ev = next((e for e in evs if e.criterion_id == criterion.id and e.found), None)
        if ev is None or not ev.doc_name:
            continue
        entries.append((bidder_id, _evidence_source_pattern(ev)))

    if len(entries) < 3:
        return []

    total = len(entries)
    counts = Counter(p for _, p in entries)
    dominant, cnt = counts.most_common(1)[0]
    if cnt / total <= 0.70:
        return []

    mismatched = sorted({bid for bid, p in entries if p != dominant})
    if not mismatched:
        return []

    return [
        AnomalyFlag(
            criterion_id=criterion.id,
            bidder_ids=mismatched,
            anomaly_type="document_pattern_mismatch",
            description=(
                f"Majority document/source pattern ({dominant}) covers "
                f"{cnt}/{total} bidders; these bidders differ."
            ),
            severity="medium",
        )
    ]


def _cross_document_conflicts(
    criterion_by_id: dict[str, CriterionSchema],
    all_evidence: dict[str, list[EvidenceRecord]],
    all_decisions: dict[str, list[DecisionLike]],
) -> list[AnomalyFlag]:
    flags: list[AnomalyFlag] = []

    for bidder_id, evs in all_evidence.items():
        by_field: dict[str, list[EvidenceRecord]] = defaultdict(list)
        for ev in evs:
            if not ev.found:
                continue
            c = criterion_by_id.get(ev.criterion_id)
            if not c:
                continue
            field_key = c.field or c.id
            by_field[field_key].append(ev)

        for field_key, group in by_field.items():
            doc_names = {e.doc_name for e in group if e.doc_name}
            if len(doc_names) < 2:
                continue
            nums: list[tuple[str, float]] = []
            for e in group:
                if isinstance(e.extracted_value, (int, float)):
                    nums.append((e.criterion_id, float(e.extracted_value)))
            if len(nums) < 2:
                continue
            values_only = [v for _, v in nums]
            vmax, vmin = max(values_only), min(values_only)
            if vmin == 0:
                continue
            mismatch = abs(vmax - vmin) / abs(vmin)

            if mismatch <= 0.05:
                continue

            crit_ids = {cid for cid, _ in nums}
            desc = (
                f"Field group {field_key}: values differ by {mismatch:.1%} "
                f"across documents {sorted(doc_names)!s}."
            )
            flags.append(
                AnomalyFlag(
                    criterion_id=sorted(crit_ids)[0],
                    bidder_ids=[bidder_id],
                    anomaly_type="cross_document_conflict",
                    description=desc,
                    severity="high",
                )
            )

            dec_list = all_decisions.get(bidder_id, [])
            by_cid = {d.criterion_id: d for d in dec_list}
            for cid in crit_ids:
                d = by_cid.get(cid)
                if d is not None:
                    _set_confidence(d, d.confidence - 0.2)

    return flags


def run_consistency_check(
    all_decisions: dict[str, list[VerdictDecision | EvaluationResult]],
    all_evidence: dict[str, list[EvidenceRecord]],
    criteria: list[CriterionSchema],
) -> list[AnomalyFlag]:
    """
    Cross-bidder checks. Mutates ``confidence`` on decision objects when
    ``cross_document_conflict`` applies (minus 0.2, clipped to [0, 1]).
    """
    criterion_by_id = {c.id: c for c in criteria}
    flags: list[AnomalyFlag] = []

    for criterion in criteria:
        flags.extend(_numeric_outliers(criterion, all_evidence))
        flags.extend(_document_pattern_mismatch(criterion, all_evidence))

    flags.extend(_cross_document_conflicts(criterion_by_id, all_evidence, all_decisions))

    return flags


class ConsistencyEngine:
    @staticmethod
    def _flag_to_report(flag: AnomalyFlag) -> AnomalyReport:
        return AnomalyReport(
            criterion_id=flag.criterion_id,
            bidder_ids=flag.bidder_ids,
            anomaly_detected=True,
            reason=f"[{flag.severity}] {flag.anomaly_type}: {flag.description}",
            details={
                "anomaly_type": flag.anomaly_type,
                "severity": flag.severity,
                "description": flag.description,
            },
        )

    def run(
        self,
        results: list[EvaluationResult],
        *,
        criteria: list[CriterionSchema],
        evidence_by_bidder: dict[str, list[EvidenceRecord]],
    ) -> list[AnomalyReport]:
        cid_order = {c.id: i for i, c in enumerate(criteria)}
        by_bidder: dict[str, list[EvaluationResult]] = defaultdict(list)
        for r in results:
            by_bidder[r.bidder_id].append(r)
        for bidder_id in by_bidder:
            by_bidder[bidder_id].sort(
                key=lambda r: cid_order.get(r.criterion_id, 999)
            )

        flags = run_consistency_check(dict(by_bidder), evidence_by_bidder, criteria)
        return [self._flag_to_report(f) for f in flags]