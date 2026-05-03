import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AnomalyFlag, CriterionSchema, VerdictDecision } from "../types";

export type WizardStep = "upload" | "criteria" | "matrix";

export interface BidderFileRow {
  id: string;
  file: File | null;
  bidderName: string;
}

export interface WizardContextValue {
  step: WizardStep;
  setStep: (s: WizardStep) => void;
  sessionId: string | null;
  tenderId: string | null;
  tenderStats: { blockCount: number; pages: number } | null;
  setTenderSession: (meta: { sessionId: string; tenderId: string; blockCount: number; pages: number }) => void;
  bidderRows: BidderFileRow[];
  setBidderRows: React.Dispatch<React.SetStateAction<BidderFileRow[]>>;
  /** Bidder API ids in submission order (for matrix row order). */
  bidderIdsOrdered: string[];
  setBidderIdsOrdered: React.Dispatch<React.SetStateAction<string[]>>;
  criteria: CriterionSchema[];
  setCriteria: React.Dispatch<React.SetStateAction<CriterionSchema[]>>;
  criteriaAmbiguousInitially: number;
  setCriteriaAmbiguousInitially: React.Dispatch<React.SetStateAction<number>>;
  decisionsByBidder: Record<string, VerdictDecision[]>;
  setDecisionsByBidder: React.Dispatch<React.SetStateAction<Record<string, VerdictDecision[]>>>;
  anomalies: AnomalyFlag[];
  setAnomalies: React.Dispatch<React.SetStateAction<AnomalyFlag[]>>;
  reviewedAnomalyKeys: Set<string>;
  markAnomalyReviewed: (key: string) => void;
  clearAnomalyReviews: () => void;
  resetWizard: () => void;
  globalError: string | null;
  setGlobalError: (e: string | null) => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

function newRowId() {
  return `row-${Math.random().toString(36).slice(2, 10)}`;
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tenderId, setTenderId] = useState<string | null>(null);
  const [tenderStats, setTenderStats] = useState<{ blockCount: number; pages: number } | null>(null);
  const [bidderRows, setBidderRows] = useState<BidderFileRow[]>([]);
  const [bidderIdsOrdered, setBidderIdsOrdered] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<CriterionSchema[]>([]);
  const [criteriaAmbiguousInitially, setCriteriaAmbiguousInitially] = useState(0);
  const [decisionsByBidder, setDecisionsByBidder] = useState<Record<string, VerdictDecision[]>>({});
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [reviewedAnomalyKeys, setReviewedKeys] = useState<Set<string>>(new Set());
  const [globalError, setGlobalError] = useState<string | null>(null);

  const setTenderSession = useCallback((meta: { sessionId: string; tenderId: string; blockCount: number; pages: number }) => {
    setSessionId(meta.sessionId);
    setTenderId(meta.tenderId);
    setTenderStats({ blockCount: meta.blockCount, pages: meta.pages });
  }, []);

  const markAnomalyReviewed = useCallback((key: string) => {
    setReviewedKeys((prev) => new Set(prev).add(key));
  }, []);

  const clearAnomalyReviews = useCallback(() => {
    setReviewedKeys(new Set());
  }, []);

  const resetWizard = useCallback(() => {
    setStep("upload");
    setSessionId(null);
    setTenderId(null);
    setTenderStats(null);
    setBidderRows([]);
    setBidderIdsOrdered([]);
    setCriteria([]);
    setCriteriaAmbiguousInitially(0);
    setDecisionsByBidder({});
    setAnomalies([]);
    setReviewedKeys(new Set());
    setGlobalError(null);
  }, []);

  const value = useMemo(
    (): WizardContextValue => ({
      step,
      setStep,
      sessionId,
      tenderId,
      tenderStats,
      setTenderSession,
      bidderRows,
      setBidderRows,
      bidderIdsOrdered,
      setBidderIdsOrdered,
      criteria,
      setCriteria,
      criteriaAmbiguousInitially,
      setCriteriaAmbiguousInitially,
      decisionsByBidder,
      setDecisionsByBidder,
      anomalies,
      setAnomalies,
      reviewedAnomalyKeys,
      markAnomalyReviewed,
      clearAnomalyReviews,
      resetWizard,
      globalError,
      setGlobalError,
    }),
    [
      step,
      sessionId,
      tenderId,
      tenderStats,
      bidderRows,
      bidderIdsOrdered,
      criteria,
      criteriaAmbiguousInitially,
      decisionsByBidder,
      anomalies,
      reviewedAnomalyKeys,
      globalError,
      setTenderSession,
      markAnomalyReviewed,
      clearAnomalyReviews,
      resetWizard,
    ],
  );

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used within WizardProvider");
  return ctx;
}

export { newRowId };
