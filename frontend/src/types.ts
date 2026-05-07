// Phase 8 / evaluation types
export type CriterionType = "numeric_threshold" | "semantic_match";
export type Decision = "ELIGIBLE" | "NOT_ELIGIBLE" | "NEEDS_MANUAL_REVIEW";

export interface CriterionSchema {
  id: string;
  description: string;
  type: CriterionType;
  field?: string | null;
  threshold?: number | null;
  currency?: string | null;
  years_required?: number | null;
  mandatory: boolean;
  legal_keywords_found: string[];
  evidence_sources: string[];
  ambiguous: boolean;
}

export interface EvidenceRecord {
  criterion_id: string;
  bidder_id: string;
  extracted_value?: number | string | null;
  raw_text?: string | null;
  doc_name?: string | null;
  page_number?: number | null;
  ocr_confidence: number;
  extraction_method: string;
  found: boolean;
  semantic_alignment: number;
  value_clarity: number;
}

export interface VerdictDecision {
  criterion_id: string;
  bidder_id: string;
  decision: Decision;
  confidence: number;
  reasoning: string;
  evidence: EvidenceRecord;
}

export interface AnomalyFlag {
  criterion_id: string;
  bidder_ids: string[];
  anomaly_type: string;
  description: string;
  severity: string;
}

export type OfficerFeedbackVerdict = "agreed" | "overridden";

export interface OfficerFeedbackRequest {
  run_id: string;
  criterion_id: string;
  bidder_id: string;
  verdict: OfficerFeedbackVerdict;
  officer_note: string | null;
  created_at: string;
}

export interface QueryRequest {
  run_id: string;
  question: string;
}

export interface QueryResponse {
  answer: string;
  run_id: string;
  question: string;
}

export interface TenderUploadResponse {
  session_id: string;
  tender_id: string;
  block_count: number;
  pages: number;
}

export interface BidderUploadResponse {
  bidder_id: string;
  block_count: number;
}

export interface CriteriaExtractResponse {
  criteria: CriterionSchema[];
  ambiguous_count: number;
}

export interface EvaluateRunResponse {
  decisions: Record<string, VerdictDecision[]>;
  anomalies: AnomalyFlag[];
}

/** Response from POST /api/demo/seed — hydrates wizard + mirrors ORM artefacts. */
export interface DemoSeedResponse {
  session_id: string;
  tender_id: string;
  tender_title: string;
  tender_block_count: number;
  tender_pages: number;
  criteria: CriterionSchema[];
  decisions: Record<string, VerdictDecision[]>;
  anomalies: AnomalyFlag[];
  bidder_ids_ordered: string[];
  ambiguous_initially: number;
}
