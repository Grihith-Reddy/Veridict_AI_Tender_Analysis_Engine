import { useWizard } from "../context/WizardContext";
import type { AnomalyFlag } from "../types";

function severityTone(s: string) {
  const sl = (s ?? "").toLowerCase();
  if (sl.includes("high")) return "border-deny/45 bg-deny/10 text-deny";
  if (sl.includes("medium")) return "border-review/45 bg-review/10 text-review";
  return "border-line bg-panel text-muted";
}

function anomalyKey(a: AnomalyFlag, idx: number) {
  return `${a.criterion_id}-${a.anomaly_type}-${idx}`;
}

export function AnomalyPanel() {
  const { anomalies, reviewedAnomalyKeys, markAnomalyReviewed } = useWizard();

  if (anomalies.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line py-12 text-center font-mono text-sm text-muted">
        Zero cross-bidder integrity flags emitted for this adjudication pulse.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {anomalies.map((a, idx) => {
        const key = anomalyKey(a, idx);
        const reviewed = reviewedAnomalyKeys.has(key);

        return (
          <li
            key={key}
            className={`rounded-xl border p-4 shadow-hud transition-opacity ${severityTone(a.severity)} ${reviewed ? "opacity-50" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-black/35 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-txt ring-1 ring-line">
                  {a.anomaly_type.replace(/_/g, " ")}
                </span>
                <span className="rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ring-1 ring-line">
                  Severity • {a.severity}
                </span>
              </div>
              <button
                type="button"
                disabled={reviewed}
                onClick={() => markAnomalyReviewed(key)}
                className="shrink-0 rounded border border-line bg-surface px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-txt hover:border-accent hover:text-accent disabled:cursor-default disabled:border-line disabled:text-muted disabled:opacity-60"
              >
                {reviewed ? "Marked reviewed" : "Mark reviewed"}
              </button>
            </div>
            <p className="mt-3 font-sans text-sm leading-relaxed text-txt">{a.description}</p>
            {(a.bidder_ids ?? []).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="self-center font-mono text-[9px] uppercase tracking-wider text-muted">Subjects</span>
                {(a.bidder_ids ?? []).map((b) => (
                  <span
                    key={`${key}-${b}`}
                    className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 font-mono text-[10px] text-accent"
                  >
                    {b}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
