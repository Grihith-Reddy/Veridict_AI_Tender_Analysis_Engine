import { useEffect } from "react";
import { confidenceBreakdown } from "../confidenceBreakdown";
import type { Decision, VerdictDecision } from "../types";

function badgeForDecision(d: Decision) {
  if (d === "ELIGIBLE") return "bg-eligible/20 text-eligible ring-eligible/40";
  if (d === "NOT_ELIGIBLE") return "bg-deny/15 text-deny ring-deny/40";
  return "bg-review/15 text-review ring-review/40";
}

const FACTOR_META = [
  { key: "ocrW" as const, label: "OCR signal", pct: "20%", color: "bg-accent" },
  { key: "extractionW" as const, label: "Extraction reliability", pct: "30%", color: "bg-eligible" },
  { key: "semanticW" as const, label: "Semantic alignment", pct: "30%", color: "bg-review" },
  { key: "clarityW" as const, label: "Value clarity", pct: "20%", color: "bg-frost" },
] as const;

export type EvidenceDrawerProps = {
  open: boolean;
  onClose: () => void;
  decision: VerdictDecision | null;
  criterionTitle: string;
};

export function EvidenceDrawer({ open, onClose, decision, criterionTitle }: EvidenceDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!decision || !open) return null;

  const ev = decision.evidence;
  const bd = confidenceBreakdown(ev);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        type="button"
        aria-label="Dismiss panel"
        className="h-full flex-1 cursor-default bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="animate-drawer scrollbar-thin relative flex h-full w-full max-w-lg flex-col border-l border-line bg-panel shadow-[0_0_60px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-start justify-between border-b border-line bg-surface px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Evidence dossier</p>
            <h2 className="mt-1 text-lg font-semibold text-txt">{decision.criterion_id}</h2>
            <p className="mt-1 font-mono text-[11px] text-muted">{criterionTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line px-2 py-1 font-mono text-xs text-frost hover:border-accent hover:text-accent"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
            <div className="rounded-lg border border-line bg-navy px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-muted">Bidder</p>
              <p className="mt-1 text-txt">{decision.bidder_id}</p>
            </div>
            <div className="rounded-lg border border-line bg-navy px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-muted">Extracted value</p>
              <p className="mt-1 text-txt">{ev.extracted_value === null || ev.extracted_value === undefined ? "—" : String(ev.extracted_value)}</p>
            </div>
            <div className="rounded-lg border border-line bg-navy px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-muted">Document</p>
              <p className="mt-1 truncate text-txt" title={ev.doc_name ?? undefined}>
                {ev.doc_name ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-navy px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-muted">Page index</p>
              <p className="mt-1 text-txt">{ev.page_number ?? "—"}</p>
            </div>
          </div>

          <section>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Surface fragment</p>
            <pre className="scrollbar-thin mt-2 max-h-48 overflow-auto rounded-lg border border-line bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-frost shadow-inner">
              {ev.raw_text?.trim() || "No raw fragment persisted for this citation."}
            </pre>
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Confidence composition</p>
              <span className="font-mono text-sm text-accent">{(bd.total * 100).toFixed(1)}%</span>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-black/50 ring-1 ring-black/50">
              {FACTOR_META.map((f) => (
                <div
                  key={f.label}
                  className={`${f.color} border-r border-black/40 last:border-r-0`}
                  style={{
                    flex: `${Math.max(bd[f.key], 0.004)}`,
                  }}
                  title={`${f.label} (${f.pct})`}
                />
              ))}
            </div>
            <ul className="mt-4 space-y-2 font-mono text-[10px]">
              {FACTOR_META.map((f) => (
                <li key={f.key} className="flex items-center justify-between text-muted">
                  <span className="flex items-center gap-2 text-frost">
                    <span className={`h-2 w-2 rounded-sm ${f.color}`} />
                    {f.label}
                    <span className="text-muted">({f.pct})</span>
                  </span>
                  <span>{(bd[f.key] * 100).toFixed(1)} pts</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-navy p-4">
            <span
              className={`inline-block rounded px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1 ${badgeForDecision(
                decision.decision,
              )}`}
            >
              {decision.decision.replace(/_/g, " ")}
            </span>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-txt">{decision.reasoning}</p>
          </section>
        </div>
      </aside>
    </div>
  );
}
