# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\engines\doc_probe.py
from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from dataclasses import dataclass

from ..config import settings
from ..gemini_client import gemini_generate_text
from ..models import CriterionSchema, EvidenceRecord, TextBlock

logger = logging.getLogger(__name__)

SYNONYM_LEXICON = {
    "annual_turnover": ["turnover", "revenue", "gross receipts", "net sales", "total income"],
    "work_experience": ["experience", "track record", "prior work", "past projects", "completed works"],
    "net_worth": ["net worth", "solvency", "financial standing", "equity"],
    "average_annual_turnover": ["average turnover", "mean revenue"],
}

TOP_K_BLOCKS = 5
HTTP_TIMEOUT = 60.0


@dataclass
class RankedBlock:
    block: TextBlock
    score: float


def _expand_query_for_field(field: str | None) -> str:
    key = field or ""
    parts = SYNONYM_LEXICON.get(key)
    if not parts:
        return ""
    return " ".join(parts)


def _build_retrieval_query(criterion: CriterionSchema) -> str:
    field_label = criterion.field or "information"
    base = f"What is the {field_label} of the company? {criterion.description}"
    syn = _expand_query_for_field(criterion.field)
    return f"{base} {syn}".strip()


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9]+", text.lower())


def _retrieve_lexical(query: str, blocks: list[TextBlock]) -> list[RankedBlock]:
    q_tokens = set(_tokenize(query))
    scored: list[RankedBlock] = []
    for b in blocks:
        b_tokens = set(_tokenize(b.text))
        overlap = len(q_tokens.intersection(b_tokens))
        denom = math.sqrt(max(1, len(q_tokens) * len(b_tokens)))
        scored.append(RankedBlock(block=b, score=float(overlap / denom)))
    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:TOP_K_BLOCKS]


def _scale_currency(amount: float, unit: str | None) -> float:
    ul = (unit or "").lower()
    if ul == "lakh":
        return amount * 100000
    if ul == "crore":
        return amount * 10000000
    if ul == "million":
        return amount * 1000000
    if ul == "billion":
        return amount * 1000000000
    return amount


def _regex_extract_value(block_text: str) -> float | str | None:
    m = re.search(
        r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(crore|lakh|million|billion)?",
        block_text,
        re.I,
    )
    if m:
        return _scale_currency(float(m.group(1).replace(",", "")), m.group(2))

    m2 = re.search(r"\b([\d,]+(?:\.\d+)?)\s*(crore|lakh)\b", block_text, re.I)
    if m2:
        return _scale_currency(float(m2.group(1).replace(",", "")), m2.group(2))

    pct = re.search(r"\b([\d,]+(?:\.\d+)?)\s*%", block_text)
    if pct:
        return float(pct.group(1).replace(",", ""))

    years = re.search(
        r"\b(?:minimum\s+|at\s+least\s+|last\s+)?(\d{1,2})\s*years?\b",
        block_text,
        re.I,
    )
    if years:
        return int(years.group(1))
    return None


def _strip_json_fence(raw: str) -> str:
    s = raw.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.I)
    if m:
        return m.group(1).strip()
    return s


def _llm_extract_block(
    api_key: str, criterion_description: str, block_text: str
) -> tuple[bool, float | str | None]:
    truncated = block_text[:8000]
    user_msg = (
        f"Extract the numeric or text value that satisfies this criterion: {criterion_description}\n"
        f"From this text: {truncated}\n"
        'Return ONLY the extracted value as a JSON: {"value": <extracted>, "unit": <unit or null>, "found": <bool>}'
    )
    try:
        content = gemini_generate_text(
            api_key,
            model=settings.gemini_model,
            system_instruction=None,
            user_prompt=user_msg,
            temperature=0,
            json_mode=True,
            timeout=HTTP_TIMEOUT,
        )
        data = json.loads(_strip_json_fence(content))
    except Exception as exc:
        logger.debug("LLM extract failed: %s", exc)
        return False, None
    found = bool(data.get("found"))
    if not found:
        return False, None
    val = data.get("value")
    unit = data.get("unit")
    if val is None:
        return False, None
    if isinstance(val, (int, float)):
        if unit and isinstance(unit, str) and unit.lower() in {"crore", "lakh", "million", "billion"}:
            return True, _scale_currency(float(val), unit)
        return True, float(val)
    return True, str(val).strip()


def _probe_one_criterion(
    criterion: CriterionSchema,
    bidder_id: str,
    ranked: list[RankedBlock],
    gemini_api_key: str | None,
) -> EvidenceRecord:
    top_similarity = float(ranked[0].score) if ranked else 0.0

    if not ranked:
        return EvidenceRecord(
            criterion_id=criterion.id,
            bidder_id=bidder_id,
            found=False,
            semantic_alignment=max(0.0, min(1.0, top_similarity)),
            value_clarity=0.0,
            extraction_method="none",
        )

    key = (gemini_api_key or "").strip()

    for rb in ranked:
        block = rb.block
        raw_txt = block.text

        rex = _regex_extract_value(raw_txt)
        if rex is not None:
            return EvidenceRecord(
                criterion_id=criterion.id,
                bidder_id=bidder_id,
                extracted_value=rex,
                raw_text=raw_txt,
                doc_name=block.doc_name,
                page_number=block.page_number,
                ocr_confidence=block.ocr_confidence,
                extraction_method="regex",
                found=True,
                semantic_alignment=max(0.0, min(1.0, top_similarity)),
                value_clarity=1.0,
            )

        if key:
            ok, val = _llm_extract_block(key, criterion.description, raw_txt)
            if ok and val is not None and val != "":
                return EvidenceRecord(
                    criterion_id=criterion.id,
                    bidder_id=bidder_id,
                    extracted_value=val,
                    raw_text=raw_txt,
                    doc_name=block.doc_name,
                    page_number=block.page_number,
                    ocr_confidence=block.ocr_confidence,
                    extraction_method="llm",
                    found=True,
                    semantic_alignment=max(0.0, min(1.0, top_similarity)),
                    value_clarity=0.6,
                )

    best = ranked[0].block
    return EvidenceRecord(
        criterion_id=criterion.id,
        bidder_id=bidder_id,
        found=False,
        raw_text=best.text,
        doc_name=best.doc_name,
        page_number=best.page_number,
        ocr_confidence=best.ocr_confidence,
        extraction_method="none",
        semantic_alignment=max(0.0, min(1.0, top_similarity)),
        value_clarity=0.0,
    )


def probe_bidder_sync(
    text_blocks: list[TextBlock],
    criteria: list[CriterionSchema],
    bidder_id: str,
    gemini_api_key: str,
) -> list[EvidenceRecord]:
    blocks = list(text_blocks)
    results: list[EvidenceRecord] = []
    for criterion in criteria:
        query = _build_retrieval_query(criterion)
        # Use lexical retrieval — no sentence-transformers dependency
        ranked = _retrieve_lexical(query, blocks)
        results.append(_probe_one_criterion(criterion, bidder_id, ranked, gemini_api_key))
    return results


async def probe_bidder(
    text_blocks: list[TextBlock],
    criteria: list[CriterionSchema],
    bidder_id: str,
    gemini_api_key: str,
) -> list[EvidenceRecord]:
    return await asyncio.to_thread(
        probe_bidder_sync, text_blocks, criteria, bidder_id, gemini_api_key
    )


class DocProbeEngine:
    """Facade wired to synchronous evaluation pipelines."""

    def probe_bidder(
        self,
        *,
        bidder_id: str,
        bidder_blocks: list[TextBlock],
        criteria: list[CriterionSchema],
        top_k: int = TOP_K_BLOCKS,
    ) -> list[EvidenceRecord]:
        _ = top_k
        return probe_bidder_sync(
            bidder_blocks,
            criteria,
            bidder_id,
            settings.gemini_api_key or "",
        )