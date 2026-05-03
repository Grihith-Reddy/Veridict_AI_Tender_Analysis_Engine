import { useMemo, useState } from "react";
import { useWizard } from "../context/WizardContext";
import type { Decision, VerdictDecision } from "../types";

type StatusFilter = "all" | Decision;
type RowSort = "name" | "status" | "confidence";

function statusRank(d: Decision): number {
  if (d === "NOT_ELIGIBLE") return 0;
  if (d === "NEEDS_MANUAL_REVIEW") return 1;
  return 2;
}

function aggregateRow(decisions: VerdictDecision[]): Decision {
  if (!decisions.length) return "NEEDS_MANUAL_REVIEW";
  if (decisions.some((d) => d.decision === "NOT_ELIGIBLE")) return "NOT_ELIGIBLE";
  if (decisions.some((d) => d.decision === "NEEDS_MANUAL_REVIEW")) return "NEEDS_MANUAL_REVIEW";
  return "ELIGIBLE";
}

function avgConfidence(decisions: VerdictDecision[]) {
  if (!decisions.length) return 0;
  return decisions.reduce((a, d) => a + d.confidence, 0) / decisions.length;
}

function cellDotClass(d: Decision) {
  if (d === "ELIGIBLE") return "bg-eligible shadow-[0_0_10px_rgba(16,185,129,0.45)]";
  if (d === "NOT_ELIGIBLE") return "bg-deny shadow-[0_0_10px_rgba(239,68,68,0.45)]";
  return "bg-review shadow-[0_0_10px_rgba(245,158,11,0.45)]";
}

function rowBadgeClass(d: Decision) {
  if (d === "ELIGIBLE") return "border-eligible/40 bg-eligible/10 text-eligible";
  if (d === "NOT_ELIGIBLE") return "border-deny/45 bg-deny/10 text-deny";
  return "border-review/45 bg-review/10 text-review";
}

export type BidderMatrixProps = {
  onOpenEvidence: (d: VerdictDecision) => void;
};

export function BidderMatrix({ onOpenEvidence }: BidderMatrixProps) {
  const { criteria, decisionsByBidder, bidderIdsOrdered } = useWizard();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<RowSort>("name");

  const criterionOrder = criteria.map((c) => c.id);
  const idToCrit = useMemo(() => Object.fromEntries(criteria.map((c) => [c.id, c])), [criteria]);

  const bidderIds = useMemo(() => {
    const fromRun = [...bidderIdsOrdered];
    const keys = Object.keys(decisionsByBidder);
    keys.forEach((k) => {
      if (!fromRun.includes(k)) fromRun.push(k);
    });
    return fromRun;
  }, [bidderIdsOrdered, decisionsByBidder]);

  const rows = useMemo(() => {
    return bidderIds.map((bidderId) => ({
      bidderId,
      decisions: decisionsByBidder[bidderId] ?? [],
      agg: aggregateRow(decisionsByBidder[bidderId] ?? []),
      avg: avgConfidence(decisionsByBidder[bidderId] ?? []),
    }));
  }, [bidderIds, decisionsByBidder]);

  const visibleRows = useMemo(() => {
    let out = [...rows];
    if (filter !== "all") out = out.filter((r) => r.agg === filter);
    out.sort((a, b) => {
      if (sortBy === "name") return a.bidderId.localeCompare(b.bidderId);
      if (sortBy === "confidence") return b.avg - a.avg;
      return statusRank(a.agg) - statusRank(b.agg);
    });
    return out;
  }, [rows, filter, sortBy]);

  const findDecision = (bidderId: string, cid: string) =>
    decisionsByBidder[bidderId]?.find((d) => d.criterion_id === cid) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 shadow-hud">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Phase 03 — Lattice</p>
          <h2 className="text-xl font-semibold text-txt">Bidder × Criterion Verdict Lattice</h2>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted">
            <span>Filter row</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
              className="rounded border border-line bg-navy px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-txt focus:border-accent"
            >
              <option value="all">All dossiers</option>
              <option value="ELIGIBLE">Eligible aggregate</option>
              <option value="NEEDS_MANUAL_REVIEW">Review aggregate</option>
              <option value="NOT_ELIGIBLE">Disqualified aggregate</option>
            </select>
          </label>
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted">
            <span>Sort rows</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as RowSort)}
              className="rounded border border-line bg-navy px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-txt focus:border-accent"
            >
              <option value="name">Bidder designation</option>
              <option value="status">Compliance severity</option>
              <option value="confidence">Mean confidence</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-auto scrollbar-thin rounded-xl border border-line bg-panel shadow-hud">
        <table className="min-w-[720px] w-full border-collapse text-left font-mono text-[11px]">
          <thead>
            <tr className="border-b border-line bg-surface uppercase tracking-wider text-muted">
              <th className="sticky left-0 z-10 min-w-[180px] border-r border-line bg-surface px-3 py-3 text-[10px] text-frost">
                Bidder dossier
              </th>
              {criterionOrder.map((cid) => (
                <th key={cid} className="min-w-[100px] px-2 py-3 text-center text-[10px] text-accent" title={idToCrit[cid]?.description}>
                  {cid}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.bidderId} className="border-b border-line/90 hover:bg-surface/50">
                <td className="sticky left-0 z-10 border-r border-line bg-panel px-3 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-sans font-medium text-sm text-txt">{row.bidderId}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[9px] font-semibold uppercase ${rowBadgeClass(row.agg)}`}>
                        {row.agg.replace(/_/g, " ")}
                      </span>
                      <span className="text-muted">μ {(row.avg * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </td>
                {criterionOrder.map((cid) => {
                  const d = findDecision(row.bidderId, cid);
                  if (!d)
                    return (
                      <td key={`${row.bidderId}-${cid}`} className="px-1 py-2 text-center align-middle">
                        <span className="text-muted">—</span>
                      </td>
                    );
                  return (
                    <td key={`${row.bidderId}-${cid}`} className="px-1 py-2 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => onOpenEvidence(d)}
                        className="mx-auto flex w-full max-w-[88px] flex-col items-center gap-1 rounded border border-transparent px-1 py-2 hover:border-line hover:bg-black/25"
                      >
                        <span className={`h-3 w-3 rounded-full ring-2 ring-black/60 ${cellDotClass(d.decision)}`} />
                        <span className="text-[10px] text-muted">{(d.confidence * 100).toFixed(0)}%</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {(visibleRows.length === 0 || criterionOrder.length === 0) && (
          <p className="py-14 text-center text-sm text-muted">No lattice data. Complete evaluation upstream.</p>
        )}
      </div>
    </div>
  );
}
