import { useWizard } from "../context/WizardContext";
import type { AnomalyFlag } from "../types";

function severityStyle(s: string): React.CSSProperties {
  const sl = (s ?? "").toLowerCase();
  if (sl.includes("high"))   return { background: "rgba(196,30,30,0.06)",  border: "2px solid rgba(196,30,30,0.35)"  };
  if (sl.includes("medium")) return { background: "rgba(179,89,0,0.06)", border: "2px solid rgba(179,89,0,0.35)" };
  return { background: "var(--bg)", border: "2px solid var(--txt)" };
}

function severityDotColor(s: string): string {
  const sl = (s ?? "").toLowerCase();
  if (sl.includes("high"))   return "var(--deny)";
  if (sl.includes("medium")) return "var(--review)";
  return "var(--muted)";
}

function anomalyKey(a: AnomalyFlag, idx: number) {
  return `${a.criterion_id}-${a.anomaly_type}-${idx}`;
}

export function AnomalyPanel() {
  const { anomalies, reviewedAnomalyKeys, markAnomalyReviewed } = useWizard();

  if (anomalies.length === 0) {
    return (
      <div style={{
        padding: "48px 24px", textAlign: "center",
        border: "2px dashed var(--border-soft)", borderRadius: 0,
        background: "var(--bg)",
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 0, background: "var(--bg)", border: "2px solid var(--eligible)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--eligible)" strokeWidth="2" strokeLinecap="round">
            <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "var(--txt)", marginBottom: 6 }}>No anomalies</p>
        <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
          Zero cross-bidder integrity flags emitted for this adjudication pulse.
        </p>
      </div>
    );
  }

  return (
    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
      {anomalies.map((a, idx) => {
        const key      = anomalyKey(a, idx);
        const reviewed = reviewedAnomalyKeys.has(key);

        return (
          <li
            key={key}
            style={{
              borderRadius: 0, padding: "16px 18px",
              opacity: reviewed ? 0.55 : 1,
              transition: "opacity 200ms ease",
              ...severityStyle(a.severity),
            }}
          >
            {/* Top row */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                {/* Severity dot */}
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: severityDotColor(a.severity), flexShrink: 0 }} />
                <span style={{
                  padding: "4px 10px", borderRadius: 0,
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  background: "var(--bg)", color: "var(--txt-2)",
                  border: "2px solid var(--txt)",
                }}>
                  {a.anomaly_type.replace(/_/g, " ")}
                </span>
                <span style={{
                  padding: "4px 10px", borderRadius: 0,
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  background: "var(--bg)", color: "var(--muted)",
                  border: "1px solid var(--border-soft)",
                }}>
                  {a.severity}
                </span>
                <span style={{
                  padding: "4px 10px", borderRadius: 0,
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--txt)",
                  background: "var(--bg)", border: "2px solid var(--border-soft)",
                }}>
                  {a.criterion_id}
                </span>
              </div>
              <button
                type="button"
                disabled={reviewed}
                onClick={() => markAnomalyReviewed(key)}
                style={{
                  padding: "8px 14px", borderRadius: 0, cursor: reviewed ? "default" : "pointer",
                  border: "2px solid var(--txt)", background: reviewed ? "var(--zebra)" : "var(--surface)",
                  fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: reviewed ? "var(--muted)" : "var(--txt)",
                  transition: "all 160ms ease", flexShrink: 0,
                }}
                onMouseEnter={(e) => { if (!reviewed) { (e.currentTarget as HTMLElement).style.background = "var(--txt)"; (e.currentTarget as HTMLElement).style.color = "#fff"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = reviewed ? "var(--zebra)" : "var(--surface)"; (e.currentTarget as HTMLElement).style.color = reviewed ? "var(--muted)" : "var(--txt)"; }}
              >
                {reviewed ? "✓ Reviewed" : "Mark reviewed"}
              </button>
            </div>

            {/* Description */}
            <p style={{ fontSize: 13, color: "var(--txt)", lineHeight: 1.6, marginBottom: (a.bidder_ids?.length ?? 0) > 0 ? 10 : 0 }}>
              {a.description}
            </p>

            {/* Affected bidders */}
            {(a.bidder_ids ?? []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Subjects</span>
                {(a.bidder_ids ?? []).map((b) => (
                  <span key={`${key}-${b}`} style={{
                    padding: "4px 10px", borderRadius: 0,
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                    background: "var(--bg)", border: "1px solid var(--border-soft)",
                    color: "var(--txt)",
                  }}>
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