import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatApiError, resolveAmbiguity, runEvaluation } from "../api";
import { useWizard } from "../context/WizardContext";
import type { CriterionSchema } from "../types";

function TypeBadge({ type }: { type: CriterionSchema["type"] }) {
  const semantic = type === "semantic_match";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        semantic ? "bg-review/15 text-review ring-1 ring-review/40" : "bg-accent/15 text-accent ring-1 ring-accent/40"
      }`}
    >
      {semantic ? "Semantic" : "Numeric"}
    </span>
  );
}

export function CriteriaReview() {
  const {
    sessionId,
    criteria,
    setCriteria,
    criteriaAmbiguousInitially,
    setStep,
    setDecisionsByBidder,
    setAnomalies,
    setGlobalError,
  } = useWizard();

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const stillAmbiguous = useMemo(() => criteria.filter((c) => c.ambiguous), [criteria]);
  const ambiguousResolved =
    criteriaAmbiguousInitially <= 0
      ? 0
      : Math.max(0, criteriaAmbiguousInitially - stillAmbiguous.length);

  const denominator = criteriaAmbiguousInitially <= 0 ? 1 : criteriaAmbiguousInitially;
  const pct = Math.round((ambiguousResolved / denominator) * 100);

  const resolveMutation = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      if (!sessionId) throw new Error("No active session.");
      await resolveAmbiguity({ sessionId, criterionId: id, resolvedDescription: description.trim() });
    },
    onMutate: () => setGlobalError(null),
    onSuccess: (_, { id, description }) => {
      setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ambiguous: false, description } : c)));
      setDrafts((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
    },
    onError: (e: unknown) => setGlobalError(formatApiError(e)),
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No active session.");
      return runEvaluation(sessionId);
    },
    onMutate: () => setGlobalError(null),
    onSuccess: (data) => {
      setDecisionsByBidder(data.decisions);
      setAnomalies(data.anomalies);
      setStep("matrix");
    },
    onError: (e: unknown) => setGlobalError(formatApiError(e)),
  });

  const canRun = stillAmbiguous.length === 0;

  return (
    <div className="animate-fade-slide space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Phase 02 — Interpretation Gate</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-txt">Mandatory Criteria Corpus</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Ambiguous interpretations require adjudication before the evaluation graph executes. Locked criteria propagate to bidder probe with full provenance.
          </p>
        </div>
        <div className="w-full max-w-xs rounded-lg border border-line bg-panel px-4 py-3 shadow-hud">
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-wide text-frost">
            <span>Ambiguity resolution</span>
            <span className={stillAmbiguous.length ? "text-review" : "text-eligible"}>
              {criteriaAmbiguousInitially === 0
                ? "None flagged"
                : `${ambiguousResolved} / ${criteriaAmbiguousInitially}`}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-eligible transition-all"
              style={{ width: `${criteriaAmbiguousInitially === 0 ? 100 : pct}%` }}
            />
          </div>
          {stillAmbiguous.length > 0 && (
            <p className="mt-2 font-mono text-[10px] text-review">{stillAmbiguous.length} pending adjudication</p>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {criteria.map((criterion) => {
          const ambiguous = criterion.ambiguous;
          const drafting = drafts[criterion.id] ?? criterion.description;
          const isPending = resolveMutation.isPending && resolveMutation.variables?.id === criterion.id;

          return (
            <article
              key={criterion.id}
              className={`flex flex-col rounded-xl border bg-surface p-4 shadow-hud transition-colors ${
                ambiguous ? "border-review ring-1 ring-review/35" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-accent">{criterion.id}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <TypeBadge type={criterion.type} />
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ring-1 ${
                        criterion.mandatory
                          ? "bg-deny/10 text-deny ring-deny/30"
                          : "bg-muted/20 text-muted ring-line"
                      }`}
                    >
                      {criterion.mandatory ? "Mandatory" : "Advisory"}
                    </span>
                  </div>
                </div>
                {ambiguous && (
                  <button
                    type="button"
                    disabled={isPending || !(drafts[criterion.id] ?? criterion.description).trim()}
                    onClick={() =>
                      resolveMutation.mutate({
                        id: criterion.id,
                        description: drafts[criterion.id] ?? criterion.description,
                      })
                    }
                    className="shrink-0 rounded bg-review px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-navy hover:bg-review/90 disabled:opacity-50"
                  >
                    {isPending ? "Locking…" : "Resolve"}
                  </button>
                )}
              </div>

              {!ambiguous ? (
                <p className="mt-3 text-sm leading-relaxed text-txt">{criterion.description}</p>
              ) : (
                <textarea
                  value={drafting}
                  onChange={(e) => setDrafts((d) => ({ ...d, [criterion.id]: e.target.value }))}
                  rows={5}
                  className="mt-3 w-full resize-y rounded border border-line bg-navy px-3 py-2 font-sans text-sm leading-relaxed text-txt placeholder:text-muted focus:border-review focus:outline-none"
                  spellCheck={false}
                />
              )}

              {(criterion.evidence_sources?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Evidence sources</p>
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {(criterion.evidence_sources ?? []).map((src) => (
                      <li key={src} className="rounded bg-panel px-2 py-1 font-mono text-[10px] text-frost ring-1 ring-line">
                        {src}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(criterion.legal_keywords_found?.length ?? 0) > 0 && (
                <p className="mt-2 font-mono text-[10px] text-muted">
                  Legal keywords:&nbsp;
                  {(criterion.legal_keywords_found ?? []).join(", ")}
                </p>
              )}
            </article>
          );
        })}
      </div>

      {criteria.length === 0 && (
        <p className="rounded-lg border border-dashed border-line py-16 text-center font-mono text-sm text-muted">
          No corpus loaded. Return to intake.
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-4 border-t border-line pt-8">
        <button
          type="button"
          disabled={!canRun || runMutation.isPending || criteria.length === 0}
          onClick={() => runMutation.mutate()}
          className="rounded bg-accent px-6 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-[0_0_24px_rgba(59,130,246,0.35)] disabled:opacity-35 disabled:shadow-none hover:bg-accent/90"
        >
          {runMutation.isPending ? "Running evaluation…" : "Start Evaluation"}
        </button>
        {!canRun && criteria.length > 0 && (
          <span className="font-mono text-[11px] text-review">
            Arbitration required: resolve every ambiguous criterion before solver execution.
          </span>
        )}
      </footer>
    </div>
  );
}
