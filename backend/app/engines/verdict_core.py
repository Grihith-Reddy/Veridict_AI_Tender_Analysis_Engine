# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\engines\verdict_core.py
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from pydantic import BaseModel, Field

from ..config import settings
from ..gemini_client import gemini_from_openai_style_messages
from ..models import CriterionSchema, CriterionType, Decision, EvaluationResult, EvidenceRecord

logger = logging.getLogger(__name__)

HTTP_TIMEOUT = 45.0


class VerdictDecision(BaseModel):
    criterion_id: str
    bidder_id: str
    decision: Decision
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    evidence: EvidenceRecord


def _extraction_reliability(extraction_method: str) -> float:
    m = extraction_method.lower()
    if m == "regex":
        return 1.0
    if m == "llm":
        return 0.6
    if m in {"direct_parse", "docx_parse"}:
        return 1.0
    if m in {"ocr_scan", "ocr_image"}:
        return 0.6
    return 0.0


def _formula_value_clarity(evidence: EvidenceRecord) -> float:
    if not evidence.found:
        return 0.0
    v = evidence.extracted_value
    if isinstance(v, bool):
        return 0.5
    if isinstance(v, (int, float)):
        return 1.0
    if isinstance(v, str):
        try:
            float(v.replace(",", "").strip())
            return 1.0
        except ValueError:
            pass
        if re.search(r"\d+\s*[-–—to]+\s*\d+", v, re.I):
            return 0.5
        return 0.5
    return 0.5


def _compute_confidence(evidence: EvidenceRecord) -> float:
    vc = _formula_value_clarity(evidence)
    rel = _extraction_reliability(evidence.extraction_method)
    conf = (
        evidence.ocr_confidence * 0.20
        + rel * 0.30
        + evidence.semantic_alignment * 0.30
        + vc * 0.20
    )
    return max(0.0, min(1.0, conf))


def _strip_json_fence(raw: str) -> str:
    s = raw.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.I)
    if m:
        return m.group(1).strip()
    return s


def _build_reasoning(
    criterion: CriterionSchema,
    evidence: EvidenceRecord,
    confidence: float,
    decision: Decision,
) -> str:
    return (
        f"Criterion: {criterion.description}. Extracted: {evidence.extracted_value} "
        f"from {evidence.doc_name} p.{evidence.page_number}. "
        f"Confidence: {confidence:.2f}. Decision: {decision.value}."
    )


def _semantic_llm_judgement(criterion_desc: str, evidence_text: str, api_key: str) -> dict[str, Any]:
    key = (api_key or "").strip()
    truncated = (evidence_text or "")[:3000]
    if not key:
        fb = truncated.lower()
        if any(k in fb for k in ["not eligible", "missing", "not provided", "non-compliant"]):
            return {"label": "NO", "reason": "Fallback heuristic found non-compliance indicators."}
        if any(k in fb for k in ["provided", "complied", "compliance", "eligible"]):
            return {"label": "YES", "reason": "Fallback heuristic found compliance indicators."}
        return {"label": "UNCERTAIN", "reason": "Insufficient semantic certainty from fallback parser."}

    prompt = (
        "Does this text confirm criterion compliance? "
        "Return JSON with keys label (YES/NO/UNCERTAIN) and reason (single sentence).\n"
        f"Criterion: {criterion_desc}\nEvidence: {truncated}"
    )
    try:
        content = gemini_from_openai_style_messages(
            key,
            model=settings.gemini_model,
            messages=[
                {"role": "system", "content": "You are a procurement compliance evaluator."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            json_mode=True,
            timeout=HTTP_TIMEOUT,
        )
        parsed = json.loads(_strip_json_fence(content))
        return {"label": parsed.get("label", "UNCERTAIN"), "reason": parsed.get("reason", "")}
    except Exception as exc:
        logger.warning("Semantic Gemini call failed: %s", exc)
        return {"label": "UNCERTAIN", "reason": "Semantic model call failed; manual review recommended."}


def evaluate(evidence: EvidenceRecord, criterion: CriterionSchema) -> VerdictDecision:
    return _evaluate_impl(evidence, criterion, settings.gemini_api_key or "")


def _evaluate_impl(evidence: EvidenceRecord, criterion: CriterionSchema, llm_api_key: str) -> VerdictDecision:
    confidence = _compute_confidence(evidence)

    if not evidence.found:
        return VerdictDecision(
            criterion_id=criterion.id,
            bidder_id=evidence.bidder_id,
            decision=Decision.NEEDS_MANUAL_REVIEW,
            confidence=confidence,
            reasoning="Evidence not found in submitted documents",
            evidence=evidence,
        )

    ctype = criterion.type
    is_numeric = ctype == CriterionType.numeric_threshold
    is_semantic = ctype == CriterionType.semantic_match

    decision: Decision
    reasoning: str

    if is_numeric:
        if criterion.threshold is None:
            decision = Decision.NEEDS_MANUAL_REVIEW
            reasoning = _build_reasoning(criterion, evidence, confidence, decision)
        elif not isinstance(evidence.extracted_value, (int, float)):
            decision = Decision.NEEDS_MANUAL_REVIEW
            reasoning = _build_reasoning(criterion, evidence, confidence, decision)
        elif confidence < 0.80:
            decision = Decision.NEEDS_MANUAL_REVIEW
            reasoning = _build_reasoning(criterion, evidence, confidence, decision)
        elif float(evidence.extracted_value) >= float(criterion.threshold):
            decision = Decision.ELIGIBLE
            reasoning = _build_reasoning(criterion, evidence, confidence, decision)
        else:
            decision = Decision.NOT_ELIGIBLE
            reasoning = _build_reasoning(criterion, evidence, confidence, decision)

    elif is_semantic:
        if confidence < 0.50:
            decision = Decision.NEEDS_MANUAL_REVIEW
            reasoning = _build_reasoning(criterion, evidence, confidence, decision)
        elif confidence >= 0.80:
            llm = _semantic_llm_judgement(criterion.description, evidence.raw_text or "", llm_api_key)
            label = str(llm.get("label", "UNCERTAIN")).upper()
            rtext = str(llm.get("reason", "Semantic verification incomplete."))
            if label == "YES":
                decision = Decision.ELIGIBLE
            elif label == "NO":
                decision = Decision.NOT_ELIGIBLE
            else:
                decision = Decision.NEEDS_MANUAL_REVIEW
            reasoning = f"{_build_reasoning(criterion, evidence, confidence, decision)} Judgment: {rtext}"
        else:
            decision = Decision.NEEDS_MANUAL_REVIEW
            reasoning = _build_reasoning(criterion, evidence, confidence, decision)

    else:
        decision = Decision.NEEDS_MANUAL_REVIEW
        reasoning = _build_reasoning(criterion, evidence, confidence, decision)

    return VerdictDecision(
        criterion_id=criterion.id,
        bidder_id=evidence.bidder_id,
        decision=decision,
        confidence=confidence,
        reasoning=reasoning,
        evidence=evidence,
    )


async def evaluate_all(
    all_evidence: list[EvidenceRecord],
    criteria: list[CriterionSchema],
    llm_api_key: str,
) -> list[VerdictDecision]:
    key = llm_api_key.strip()
    default_bidder = all_evidence[0].bidder_id if all_evidence else ""

    if len(all_evidence) == len(criteria):
        pairs = [(criteria[i], all_evidence[i]) for i in range(len(criteria))]
    else:
        by_id = {e.criterion_id: e for e in all_evidence}
        pairs = [(c, by_id.get(c.id)) for c in criteria]

    async def _one(c: CriterionSchema, ev: EvidenceRecord | None) -> VerdictDecision:
        if ev is None:
            ev = EvidenceRecord(criterion_id=c.id, bidder_id=default_bidder, found=False)
        return await asyncio.to_thread(_evaluate_impl, ev, c, key)

    return [await _one(c, ev) for c, ev in pairs]


def verdict_to_evaluation_result(vd: VerdictDecision) -> EvaluationResult:
    return EvaluationResult(
        criterion_id=vd.criterion_id,
        bidder_id=vd.bidder_id,
        decision=vd.decision,
        confidence=vd.confidence,
        reason=vd.reasoning,
        soft_flag=0.5 <= vd.confidence < 0.8,
        evidence=vd.evidence,
    )


class VerdictCoreEngine:
    def evaluate(self, *, criterion: CriterionSchema, evidence: EvidenceRecord) -> EvaluationResult:
        vd = evaluate(evidence, criterion)
        return verdict_to_evaluation_result(vd)
