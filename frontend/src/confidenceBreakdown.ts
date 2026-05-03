import type { EvidenceRecord } from "./types";

export function extractionReliability(method: string): number {
  const m = method.toLowerCase();
  if (m === "regex") return 1;
  if (m === "llm") return 0.6;
  if (m === "direct_parse" || m === "docx_parse") return 1;
  if (m === "ocr_scan" || m === "ocr_image") return 0.6;
  return 0;
}

/** Matches backend `_formula_value_clarity` weights. */
export function formulaValueClarity(ev: EvidenceRecord): number {
  if (!ev.found) return 0;
  const v = ev.extracted_value;
  if (typeof v === "number" && !Number.isNaN(v)) return 1;
  if (typeof v === "boolean") return 0.5;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, "").trim());
    if (!Number.isNaN(n)) return 1;
    return 0.5;
  }
  return 0.5;
}

export interface ConfidenceFactors {
  ocr: number;
  extraction: number;
  semantic: number;
  clarity: number;
  /** weighted slice 0..1 */
  ocrW: number;
  extractionW: number;
  semanticW: number;
  clarityW: number;
  total: number;
}

export function confidenceBreakdown(ev: EvidenceRecord): ConfidenceFactors {
  const rel = extractionReliability(ev.extraction_method);
  const vc = formulaValueClarity(ev);
  const ocrW = ev.ocr_confidence * 0.2;
  const extractionW = rel * 0.3;
  const semanticW = ev.semantic_alignment * 0.3;
  const clarityW = vc * 0.2;
  const total = Math.min(1, Math.max(0, ocrW + extractionW + semanticW + clarityW));
  return {
    ocr: ev.ocr_confidence,
    extraction: rel,
    semantic: ev.semantic_alignment,
    clarity: vc,
    ocrW,
    extractionW,
    semanticW,
    clarityW,
    total,
  };
}
