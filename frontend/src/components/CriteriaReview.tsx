import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatApiError, resolveAmbiguity, runEvaluation } from "../api";
import { useWizard } from "../context/WizardContext";
import type { CriterionSchema } from "../types";

function TypeBadge({ type }: { type: CriterionSchema["type"] }) {
  const semantic = type === "semantic_match";
  return (
    <span style={{
      display: "inline-block", padding: "4px 10px", borderRadius: 0,
      fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em",
      border: `2px solid ${semantic ? "var(--review)" : "var(--txt)"}`,
      background: "var(--bg)",
      color: semantic ? "var(--review)" : "var(--txt)",
    }}>
      {semantic ? "Semantic" : "Numeric"}
    </span>
  );
}

export function CriteriaReview() {
  const { sessionId, criteria, setCriteria, criteriaAmbiguousInitially, setStep, setDecisionsByBidder, setAnomalies, setGlobalError } = useWizard();
  const [drafts, setDrafts]           = useState<Record<string, string>>({});
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});

  const isExpanded  = (id: string) => expandedById[id] !== false;
  const toggleExpanded = (id: string) => setExpandedById((m) => ({ ...m, [id]: !isExpanded(id) }));

  const stillAmbiguous   = useMemo(() => criteria.filter((c) => c.ambiguous), [criteria]);
  const ambiguousResolved = criteriaAmbiguousInitially <= 0 ? 0 : Math.max(0, criteriaAmbiguousInitially - stillAmbiguous.length);
  const denominator       = criteriaAmbiguousInitially <= 0 ? 1 : criteriaAmbiguousInitially;
  const pct               = Math.round((ambiguousResolved / denominator) * 100);

  const resolveMutation = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      if (!sessionId) throw new Error("No active session.");
      await resolveAmbiguity({ sessionId, criterionId: id, resolvedDescription: description.trim() });
    },
    onMutate: () => setGlobalError(null),
    onSuccess: (_, { id, description }) => {
      setCriteria((prev) => prev.map((c) => c.id === id ? { ...c, ambiguous: false, description } : c));
      setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    },
    onError: (e: unknown) => setGlobalError(formatApiError(e)),
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No active session.");
      return runEvaluation(sessionId);
    },
    onMutate: () => setGlobalError(null),
    onSuccess: (data) => { setDecisionsByBidder(data.decisions); setAnomalies(data.anomalies); setStep("matrix"); },
    onError: (e: unknown) => setGlobalError(formatApiError(e)),
  });

  const canRun = stillAmbiguous.length === 0;

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 28, paddingBottom: 28, borderBottom: "2px solid var(--txt)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "var(--txt)", border: "2px solid var(--txt)", padding: "4px 10px" }}>02</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--muted)" }}>Criteria</span>
          </div>
          <h1 className="font-display" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", fontWeight: 800, color: "var(--txt)", letterSpacing: "-0.04em", marginBottom: 8, lineHeight: 1.05 }}>Corpus review</h1>
          <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: 480, lineHeight: 1.55 }}>
            Resolve ambiguity before the lattice runs. Nothing is inferred for you.
          </p>
        </div>

        <div style={{ background: "var(--surface)", border: "2px solid var(--txt)", borderRadius: 0, padding: "18px 22px", minWidth: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 12 }}>
            <span>Ambiguity</span>
            <span style={{ color: stillAmbiguous.length ? "var(--review)" : "var(--eligible)" }}>
              {criteriaAmbiguousInitially === 0 ? "None" : `${ambiguousResolved}/${criteriaAmbiguousInitially}`}
            </span>
          </div>
          <div style={{ height: 8, background: "var(--border-soft)", borderRadius: 0, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--txt)", width: `${criteriaAmbiguousInitially === 0 ? 100 : pct}%`, transition: "width 300ms ease" }} />
          </div>
          {stillAmbiguous.length > 0 && (
            <p style={{ marginTop: 8, fontSize: 10, color: "var(--review)", fontFamily: "var(--font-mono)" }}>{stillAmbiguous.length} pending adjudication</p>
          )}
        </div>
      </div>

      {/* Criteria grid */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))" }}>
        {criteria.map((criterion) => {
          const ambiguous = criterion.ambiguous;
          const drafting  = drafts[criterion.id] ?? criterion.description;
          const isPending = resolveMutation.isPending && resolveMutation.variables?.id === criterion.id;
          const open      = isExpanded(criterion.id);

          return (
            <article
              key={criterion.id}
              style={{
                background: "var(--surface)",
                border: `2px solid ${ambiguous ? "var(--review)" : "var(--txt)"}`,
                borderRadius: 0, overflow: "hidden",
                transition: "all 160ms ease",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "16px 18px", borderBottom: ambiguous ? "2px solid var(--review)" : "2px solid var(--txt)", background: "var(--bg)" }}>
                <button type="button" onClick={() => toggleExpanded(criterion.id)} style={{ minWidth: 0, flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--txt)", fontWeight: 600, marginBottom: 8, letterSpacing: "0.06em" }}>{criterion.id}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <TypeBadge type={criterion.type} />
                    <span style={{
                      display: "inline-block", padding: "4px 10px", borderRadius: 0,
                      fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
                      border: `2px solid ${criterion.mandatory ? "var(--deny)" : "var(--border-soft)"}`,
                      background: "var(--bg)",
                      color: criterion.mandatory ? "var(--deny)" : "var(--muted)",
                    }}>
                      {criterion.mandatory ? "Mandatory" : "Advisory"}
                    </span>
                    {ambiguous && (
                      <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 0, fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", border: "2px solid var(--review)", background: "var(--bg)", color: "var(--review)" }}>
                        Ambiguous
                      </span>
                    )}
                  </div>
                </button>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  {ambiguous && (
                    <button
                      type="button"
                      disabled={isPending || !drafting.trim()}
                      onClick={() => resolveMutation.mutate({ id: criterion.id, description: drafts[criterion.id] ?? criterion.description })}
                      style={{
                        padding: "8px 16px", borderRadius: 0, cursor: "pointer", border: "2px solid var(--txt)",
                        background: "var(--txt)", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase",
                        transition: "all 160ms ease", opacity: isPending ? 0.6 : 1,
                      }}
                    >
                      {isPending ? "Locking…" : "Resolve"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(criterion.id)}
                    style={{ padding: "6px 12px", borderRadius: 0, border: "2px solid var(--txt)", background: "var(--bg)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--txt)" }}
                    aria-expanded={open}
                  >
                    {open ? "▾" : "▸"}
                  </button>
                </div>
              </div>

              {/* Card body */}
              {open && (
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {!ambiguous ? (
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--txt)" }}>{criterion.description}</p>
                  ) : (
                    <textarea
                      value={drafting}
                      onChange={(e) => setDrafts((d) => ({ ...d, [criterion.id]: e.target.value }))}
                      rows={4}
                      style={{ resize: "vertical", borderColor: "rgba(255,159,10,0.4)" }}
                      spellCheck={false}
                    />
                  )}

                  {(criterion.evidence_sources?.length ?? 0) > 0 && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                      <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 6 }}>Evidence sources</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(criterion.evidence_sources ?? []).map((src) => (
                          <span key={src} style={{ padding: "4px 10px", borderRadius: 0, border: "1px solid var(--border-soft)", background: "var(--bg)", fontSize: 11, color: "var(--frost)", fontFamily: "var(--font-mono)" }}>{src}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(criterion.legal_keywords_found?.length ?? 0) > 0 && (
                    <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      Legal keywords: {(criterion.legal_keywords_found ?? []).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {criteria.length === 0 && (
        <p style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)", border: "2px dashed var(--border-soft)", borderRadius: 0, fontSize: 13, fontFamily: "var(--font-mono)" }}>
          No corpus loaded. Return to intake.
        </p>
      )}

      {/* Fixed bottom bar */}
      <div style={{
        position: "fixed", bottom: 0, left: "var(--sidebar-w)", right: 0, zIndex: 40,
        borderTop: "2px solid var(--txt)", background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(10px)", padding: "16px 40px",
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
      }}>
        <button
          type="button"
          disabled={!canRun || runMutation.isPending || criteria.length === 0}
          onClick={() => runMutation.mutate()}
          style={{
            padding: "12px 28px", borderRadius: 0, border: "2px solid var(--txt)",
            background: canRun && !runMutation.isPending ? "var(--txt)" : "var(--bg)",
            color: canRun && !runMutation.isPending ? "#fff" : "var(--muted)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", cursor: canRun ? "pointer" : "not-allowed",
            transition: "all 180ms ease",
          }}
        >
          {runMutation.isPending ? "Running…" : "Run evaluation"}
        </button>
        {!canRun && criteria.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--review)", fontFamily: "var(--font-mono)" }}>
            Resolve all ambiguous criteria before proceeding.
          </span>
        )}
      </div>
    </div>
  );
}