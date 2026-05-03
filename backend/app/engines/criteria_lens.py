# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\engines\criteria_lens.py
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from ..config import settings
from ..gemini_client import gemini_from_openai_style_messages
from ..models import CriterionSchema, CriterionType, TextBlock

logger = logging.getLogger(__name__)

LEGAL_KEYWORDS = ("shall", "must", "essential", "mandatory", "compulsory", "required")

AMBIGUITY_MARKERS = (
    "preferably",
    "as applicable",
    "where possible",
    "at the discretion",
)

CRITERIA_SYSTEM_PROMPT = (
    "You are a government procurement expert. Extract ALL evaluation criteria from this tender document.\n"
    "For each criterion, return a JSON object with fields:\n"
    "id (string, e.g. C-01), description (string), type (one of: numeric_threshold / semantic / boolean),\n"
    "field (snake_case canonical name), threshold (number or null), currency (string or null),\n"
    "mandatory (boolean — true if text contains shall/must/essential/mandatory/compulsory/required),\n"
    "legal_keywords_found (list of matching keywords found in source text),\n"
    "evidence_sources (list of acceptable document types mentioned),\n"
    "ambiguous (boolean — true if text contains preferably/as applicable/where possible/at the discretion)\n"
    "Return ONLY a JSON array of these objects. No preamble, no markdown."
)

MAX_TENDER_CHARS = 180_000
HTTP_TIMEOUT = 120.0


def detect_legal_keywords(text: str) -> list[str]:
    """Return mandatory-style keywords found in text (case-insensitive substring match)."""
    lower = text.lower()
    return [kw for kw in LEGAL_KEYWORDS if kw in lower]


def flag_ambiguous(text: str) -> bool:
    """True if any ambiguity indicator phrase appears (case-insensitive)."""
    lower = text.lower()
    return any(marker in lower for marker in AMBIGUITY_MARKERS)


def concatenate_tender_text(text_blocks: list[TextBlock]) -> str:
    ordered = sorted(text_blocks, key=lambda tb: (tb.doc_name, tb.page_number, tb.block_index))
    return "\n".join(tb.text for tb in ordered)


def _strip_json_fences(raw: str) -> str:
    s = raw.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


def _parse_criteria_json(content: str) -> list[dict[str, Any]] | None:
    try:
        data = json.loads(_strip_json_fences(content))
    except json.JSONDecodeError:
        return None
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        inner = data.get("criteria")
        if isinstance(inner, list):
            return [x for x in inner if isinstance(x, dict)]
    return None


def _normalize_type_for_schema(raw_type: str | None) -> CriterionType:
    t = (raw_type or "").strip().lower()
    if t == "numeric_threshold":
        return CriterionType.numeric_threshold
    if t in ("semantic", "boolean", "semantic_match"):
        return CriterionType.semantic_match
    return CriterionType.semantic_match


def _coerce_criterion_dict(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    out["type"] = _normalize_type_for_schema(str(out.get("type", ""))).value
    for key in ("legal_keywords_found", "evidence_sources"):
        v = out.get(key)
        if v is None:
            out[key] = []
        elif not isinstance(v, list):
            out[key] = [str(v)]
        else:
            out[key] = [str(x) for x in v]
    if "mandatory" not in out:
        out["mandatory"] = False
    if "ambiguous" not in out:
        out["ambiguous"] = False
    if out.get("field") is not None:
        out["field"] = str(out["field"]).strip() or None
    if out.get("description") is not None:
        out["description"] = str(out["description"]).strip()
    return out


def _gemini_criteria_chat(api_key: str, messages: list[dict[str, str]]) -> str:
    return gemini_from_openai_style_messages(
        api_key,
        model=settings.gemini_model,
        messages=messages,
        temperature=0.1,
        json_mode=True,
        timeout=HTTP_TIMEOUT,
    )


def extract_criteria_sync(text_blocks: list[TextBlock], api_key: str) -> list[CriterionSchema]:
    """Synchronous criteria extraction via Gemini (CriteriaLensEngine / async workers)."""
    if not api_key.strip():
        logger.info("Criteria extraction skipped: empty Gemini API key")
        return []

    tender_text = concatenate_tender_text(text_blocks)
    if not tender_text.strip():
        return []

    user_body = tender_text[:MAX_TENDER_CHARS]
    messages: list[dict[str, str]] = [
        {"role": "system", "content": CRITERIA_SYSTEM_PROMPT},
        {"role": "user", "content": user_body},
    ]

    try:
        content = _gemini_criteria_chat(api_key.strip(), messages)
    except Exception as exc:
        logger.warning("Gemini criteria extraction failed: %s", exc)
        return []

    rows = _parse_criteria_json(content)
    if rows is None:
        correction = (
            "Your previous response was not a valid JSON array of criterion objects. "
            "Reply with ONLY a JSON array (no markdown, no preamble). "
            f"Previous output:\n{content[:4000]}"
        )
        try:
            content2 = _gemini_criteria_chat(
                api_key.strip(),
                [
                    {"role": "system", "content": CRITERIA_SYSTEM_PROMPT},
                    {"role": "user", "content": user_body},
                    {"role": "user", "content": correction},
                ],
            )
            rows = _parse_criteria_json(content2)
        except Exception as exc:
            logger.warning("Criteria JSON retry failed: %s", exc)
            rows = None

    if not rows:
        logger.warning("Criteria extraction produced no parseable JSON array")
        return []

    validated: list[CriterionSchema] = []
    for idx, row in enumerate(rows):
        try:
            coerced = _coerce_criterion_dict(row)
            validated.append(CriterionSchema.model_validate(coerced))
        except Exception as exc:
            logger.warning("Discarding invalid criterion at index %s: %s; row=%s", idx, exc, row)
            continue

    return validated


async def extract_criteria(text_blocks: list[TextBlock], api_key: str) -> list[CriterionSchema]:
    return await asyncio.to_thread(extract_criteria_sync, text_blocks, api_key)


class CriteriaLensEngine:
    def extract_criteria(self, tender_blocks: list[TextBlock]) -> list[CriterionSchema]:
        criteria = extract_criteria_sync(tender_blocks, settings.gemini_api_key or "")
        if not criteria:
            tender_text = concatenate_tender_text(tender_blocks)
            criteria = self._fallback_extract(tender_text)
        return criteria

    def _fallback_extract(self, text: str) -> list[CriterionSchema]:
        lines = [ln.strip() for ln in re.split(r"[\n\r]+", text) if ln.strip()]
        candidate_lines = [ln for ln in lines if re.search(r"\b(must|shall|required|mandatory|experience|turnover)\b", ln, re.I)]
        if not candidate_lines:
            candidate_lines = lines[:5]

        out: list[CriterionSchema] = []
        for idx, line in enumerate(candidate_lines, start=1):
            lower = line.lower()
            numeric_match = re.search(r"(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*(crore|lakh|million|billion)?", lower)
            ctype = CriterionType.numeric_threshold if numeric_match else CriterionType.semantic_match
            threshold = None
            currency = None
            if numeric_match:
                threshold = self._parse_amount(numeric_match.group(1), numeric_match.group(2))
                currency = "INR" if "₹" in line or "rs" in lower or "crore" in lower or "lakh" in lower else None

            legal_found = detect_legal_keywords(line)
            ambiguous = flag_ambiguous(line)
            field = self._infer_field(lower)
            out.append(
                CriterionSchema(
                    id=f"C-{idx:02d}",
                    description=line,
                    type=ctype,
                    field=field,
                    threshold=threshold,
                    currency=currency,
                    years_required=self._extract_years(lower),
                    mandatory=bool(legal_found),
                    legal_keywords_found=legal_found,
                    evidence_sources=self._infer_evidence_sources(lower),
                    ambiguous=ambiguous,
                )
            )
        return out

    @staticmethod
    def _parse_amount(value: str, unit: str | None) -> float:
        amount = float(value.replace(",", ""))
        unit_l = (unit or "").lower()
        if unit_l == "lakh":
            return amount * 100000
        if unit_l == "crore":
            return amount * 10000000
        if unit_l == "million":
            return amount * 1000000
        if unit_l == "billion":
            return amount * 1000000000
        return amount

    @staticmethod
    def _extract_years(text: str) -> int | None:
        m = re.search(r"last\s+(\d+)\s+(?:financial\s+)?years?", text)
        if m:
            return int(m.group(1))
        return None

    @staticmethod
    def _infer_field(text: str) -> str:
        mapping = {
            "annual_turnover": ["turnover", "revenue", "net sales", "gross receipts"],
            "work_experience": ["experience", "track record", "past projects", "prior work"],
            "net_worth": ["net worth", "solvency", "financial standing"],
            "registration": ["registration", "certificate", "license"],
        }
        for canonical, synonyms in mapping.items():
            if any(word in text for word in synonyms):
                return canonical
        return "generic_compliance"

    @staticmethod
    def _infer_evidence_sources(text: str) -> list[str]:
        evidence: list[str] = []
        if "turnover" in text or "revenue" in text:
            evidence.extend(["audited balance sheet", "CA certificate"])
        if "experience" in text:
            evidence.extend(["work orders", "completion certificates"])
        if "net worth" in text or "solvency" in text:
            evidence.extend(["bank solvency certificate", "financial statements"])
        if not evidence:
            evidence.append("supporting document")
        return evidence
