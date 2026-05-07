import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { downloadBidderPdf, formatApiError, submitOfficerFeedback } from "../api";
import { useWizard } from "../context/WizardContext";
import type { Decision, OfficerFeedbackVerdict, VerdictDecision } from "../types";

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

function cellStyle(d: Decision): React.CSSProperties {
  if (d === "ELIGIBLE") return { background: "rgba(13,122,62,0.12)", border: "1px solid rgba(13,122,62,0.4)", color: "var(--eligible)" };
  if (d === "NOT_ELIGIBLE") return { background: "rgba(196,30,30,0.1)", border: "1px solid rgba(196,30,30,0.4)", color: "var(--deny)" };
  return { background: "rgba(179,89,0,0.1)", border: "1px solid rgba(179,89,0,0.4)", color: "var(--review)" };
}

function cellLabel(d: Decision) {
  if (d === "ELIGIBLE") return "Pass";
  if (d === "NOT_ELIGIBLE") return "Fail";
  return "Review";
}

function rowBadgeStyle(d: Decision): React.CSSProperties {
  if (d === "ELIGIBLE") return { background: "rgba(13,122,62,0.12)", border: "1px solid rgba(13,122,62,0.4)", color: "var(--eligible)" };
  if (d === "NOT_ELIGIBLE") return { background: "rgba(196,30,30,0.1)", border: "1px solid rgba(196,30,30,0.4)", color: "var(--deny)" };
  return { background: "rgba(179,89,0,0.1)", border: "1px solid rgba(179,89,0,0.4)", color: "var(--review)" };
}

function feedbackLabel(verdict: OfficerFeedbackVerdict): string {
  return verdict === "agreed" ? "Agreed" : "Overridden";
}

export type BidderMatrixProps = { onOpenEvidence: (d: VerdictDecision) => void };

export function BidderMatrix({ onOpenEvidence }: BidderMatrixProps) {
  const { sessionId, criteria, decisionsByBidder, bidderIdsOrdered, setGlobalError } = useWizard();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<RowSort>("name");
  const [feedbackByCell, setFeedbackByCell] = useState<Record<string, OfficerFeedbackVerdict>>({});

  const criterionOrder = criteria.map((c) => c.id);
  const idToCrit = useMemo(() => Object.fromEntries(criteria.map((c) => [c.id, c])), [criteria]);
  const feedbackKey = (bidderId: string, criterionId: string) => `${bidderId}::${criterionId}`;

  const feedbackMutation = useMutation({
    mutationFn: async (params: { bidderId: string; criterionId: string; verdict: OfficerFeedbackVerdict }) => {
      if (!sessionId) throw new Error("No active session.");
      await submitOfficerFeedback({
        run_id: sessionId,
        criterion_id: params.criterionId,
        bidder_id: params.bidderId,
        verdict: params.verdict,
        officer_note: null,
        created_at: new Date().toISOString(),
      });
      return params;
    },
    onMutate: () => setGlobalError(null),
    onSuccess: (params) => {
      setFeedbackByCell((prev) => ({
        ...prev,
        [feedbackKey(params.bidderId, params.criterionId)]: params.verdict,
      }));
    },
    onError: (error: unknown) => setGlobalError(formatApiError(error)),
  });

  const pdfMutation = useMutation({
    mutationFn: async (bidderId: string) => {
      if (!sessionId) throw new Error("No active session.");
      const blob = await downloadBidderPdf(sessionId, bidderId);
      return { bidderId, blob };
    },
    onMutate: () => setGlobalError(null),
    onSuccess: ({ bidderId, blob }) => {
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `veridict_${bidderId}_report.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
    },
    onError: (error: unknown) => setGlobalError(formatApiError(error)),
  });

  const bidderIds = useMemo(() => {
    const fromRun = [...bidderIdsOrdered];
    Object.keys(decisionsByBidder).forEach((k) => { if (!fromRun.includes(k)) fromRun.push(k); });
    return fromRun;
  }, [bidderIdsOrdered, decisionsByBidder]);

  const rows = useMemo(() => bidderIds.map((bidderId) => ({
    bidderId,
    decisions: decisionsByBidder[bidderId] ?? [],
    agg: aggregateRow(decisionsByBidder[bidderId] ?? []),
    avg: avgConfidence(decisionsByBidder[bidderId] ?? []),
  })), [bidderIds, decisionsByBidder]);

  const visibleRows = useMemo(() => {
    let out = [...rows];
    if (filter !== "all") out = out.filter((r) => r.agg === filter);
    out.sort((a, b) => {
      if (sortBy === "name")       return a.bidderId.localeCompare(b.bidderId);
      if (sortBy === "confidence") return b.avg - a.avg;
      return statusRank(a.agg) - statusRank(b.agg);
    });
    return out;
  }, [rows, filter, sortBy]);

  const findDecision = (bidderId: string, cid: string) =>
    decisionsByBidder[bidderId]?.find((d) => d.criterion_id === cid) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header bar */}
      <div style={{
        background: "var(--surface)", border: "2px solid var(--txt)", borderRadius: 0,
        padding: "20px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "var(--txt)", border: "2px solid var(--txt)", padding: "4px 10px" }}>03</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--muted)" }}>Lattice</span>
          </div>
          <h2 className="font-display" style={{ fontSize: "clamp(1.35rem, 2.2vw, 1.75rem)", fontWeight: 800, color: "var(--txt)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>Bidder × criterion matrix</h2>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Filter</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)} style={{ width: "auto" }}>
              <option value="all">All dossiers</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="NEEDS_MANUAL_REVIEW">Review</option>
              <option value="NOT_ELIGIBLE">Disqualified</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Sort</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as RowSort)} style={{ width: "auto" }}>
              <option value="name">Bidder name</option>
              <option value="status">Compliance</option>
              <option value="confidence">Confidence</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "2px solid var(--txt)", borderRadius: 0, overflow: "auto" }} className="scrollbar-thin">
        <table style={{ minWidth: 720, width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--txt)", background: "var(--bg)" }}>
              <th style={{
                position: "sticky", left: 0, zIndex: 10, minWidth: 200,
                borderRight: "2px solid var(--txt)", background: "var(--bg)",
                padding: "14px 16px", textAlign: "left",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--txt)",
              }}>
                Bidder
              </th>
              {criterionOrder.map((cid) => (
                <th
                  key={cid}
                  title={idToCrit[cid]?.description}
                  style={{
                    minWidth: 100, padding: "14px 8px", textAlign: "center",
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--txt)",
                    cursor: "help",
                  }}
                >
                  {cid}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => {
              const isDownloadingRow = pdfMutation.isPending && pdfMutation.variables === row.bidderId;
              return (
                <tr
                  key={row.bidderId}
                  style={{
                    borderBottom: "1px solid var(--border-soft)",
                    background: ri % 2 === 1 ? "var(--zebra)" : "var(--surface)",
                    transition: "background 120ms ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(10,10,10,0.06)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ri % 2 === 1 ? "var(--zebra)" : "var(--surface)"; }}
                >
                <td style={{
                  position: "sticky", left: 0, zIndex: 5,
                  borderRight: "2px solid var(--txt)",
                  background: "inherit",
                  padding: "12px 16px",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--txt)" }}>{row.bidderId}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        display: "inline-block", padding: "3px 8px", borderRadius: 0,
                        fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)",
                        textTransform: "uppercase", letterSpacing: "0.08em",
                        ...rowBadgeStyle(row.agg),
                      }}>
                        {row.agg.replace(/_/g, " ")}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                        μ {(row.avg * 100).toFixed(0)}%
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!sessionId || isDownloadingRow}
                      onClick={() => pdfMutation.mutate(row.bidderId)}
                      style={{
                        alignSelf: "flex-start",
                        padding: "3px 8px",
                        borderRadius: 0,
                        border: "1px solid var(--border-soft)",
                        background: "var(--surface)",
                        cursor: !sessionId || isDownloadingRow ? "not-allowed" : "pointer",
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: "var(--font-mono)",
                        color: "var(--txt)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        opacity: !sessionId || isDownloadingRow ? 0.6 : 1,
                      }}
                    >
                      {isDownloadingRow ? "Loading..." : "PDF"}
                    </button>
                  </div>
                </td>
                {criterionOrder.map((cid) => {
                  const d = findDecision(row.bidderId, cid);
                  const key = feedbackKey(row.bidderId, cid);
                  const submittedVerdict = feedbackByCell[key];
                  const isSubmittingThisCell = feedbackMutation.isPending
                    && feedbackMutation.variables?.bidderId === row.bidderId
                    && feedbackMutation.variables?.criterionId === cid;
                  if (!d) return (
                    <td key={`${row.bidderId}-${cid}`} style={{ padding: "8px 6px", textAlign: "center", verticalAlign: "middle" }}>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                    </td>
                  );
                  return (
                    <td key={`${row.bidderId}-${cid}`} style={{ padding: "8px 6px", textAlign: "center", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                        <button
                          type="button"
                          onClick={() => onOpenEvidence(d)}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                            width: "100%", padding: "6px 4px", borderRadius: 0,
                            border: "1px solid transparent", background: "transparent",
                            cursor: "pointer", transition: "all 140ms ease",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--zebra)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-soft)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                        >
                          <span style={{
                            display: "inline-block", padding: "3px 8px", borderRadius: 0,
                            fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)",
                            textTransform: "uppercase", letterSpacing: "0.06em",
                            ...cellStyle(d.decision),
                          }}>
                            {cellLabel(d.decision)}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                            {(d.confidence * 100).toFixed(0)}%
                          </span>
                        </button>

                        {submittedVerdict ? (
                          <span style={{ fontSize: 10, color: "var(--eligible)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                            Saved: {feedbackLabel(submittedVerdict)}
                          </span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <button
                              type="button"
                              disabled={!sessionId || isSubmittingThisCell}
                              onClick={() => feedbackMutation.mutate({ bidderId: row.bidderId, criterionId: cid, verdict: "agreed" })}
                              style={{
                                padding: "3px 7px", borderRadius: 0, border: "1px solid var(--border-soft)",
                                background: "var(--surface)", cursor: !sessionId || isSubmittingThisCell ? "not-allowed" : "pointer",
                                fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--txt)",
                                textTransform: "uppercase", letterSpacing: "0.06em",
                                opacity: !sessionId || isSubmittingThisCell ? 0.6 : 1,
                              }}
                            >
                              {isSubmittingThisCell && feedbackMutation.variables?.verdict === "agreed" ? "Saving..." : "Agreed"}
                            </button>
                            <button
                              type="button"
                              disabled={!sessionId || isSubmittingThisCell}
                              onClick={() => feedbackMutation.mutate({ bidderId: row.bidderId, criterionId: cid, verdict: "overridden" })}
                              style={{
                                padding: "3px 7px", borderRadius: 0, border: "1px solid var(--border-soft)",
                                background: "var(--surface)", cursor: !sessionId || isSubmittingThisCell ? "not-allowed" : "pointer",
                                fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--txt)",
                                textTransform: "uppercase", letterSpacing: "0.06em",
                                opacity: !sessionId || isSubmittingThisCell ? 0.6 : 1,
                              }}
                            >
                              {isSubmittingThisCell && feedbackMutation.variables?.verdict === "overridden" ? "Saving..." : "Override"}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {(visibleRows.length === 0 || criterionOrder.length === 0) && (
          <p style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No lattice data. Complete evaluation upstream.
          </p>
        )}
      </div>
    </div>
  );
}
