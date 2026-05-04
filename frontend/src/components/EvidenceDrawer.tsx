import { useEffect } from "react";
import { confidenceBreakdown } from "../confidenceBreakdown";
import type { Decision, VerdictDecision } from "../types";

function decisionStyle(d: Decision): React.CSSProperties {
  if (d === "ELIGIBLE")          return { background: "rgba(13,122,62,0.12)", border: "2px solid rgba(13,122,62,0.4)", color: "var(--eligible)" };
  if (d === "NOT_ELIGIBLE")      return { background: "rgba(196,30,30,0.1)", border: "2px solid rgba(196,30,30,0.4)", color: "var(--deny)" };
  return { background: "rgba(179,89,0,0.1)", border: "2px solid rgba(179,89,0,0.4)", color: "var(--review)" };
}

const FACTOR_META = [
  { key: "ocrW"        as const, label: "OCR signal",             pct: "20%", color: "#0a0a0a" },
  { key: "extractionW" as const, label: "Extraction reliability", pct: "30%", color: "#0d7a3e" },
  { key: "semanticW"   as const, label: "Semantic alignment",     pct: "30%", color: "#b35900" },
  { key: "clarityW"    as const, label: "Value clarity",          pct: "20%", color: "#3d3d5c" },
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!decision || !open) return null;

  const ev = decision.evidence;
  const bd = confidenceBreakdown(ev);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Dismiss panel"
        onClick={onClose}
        style={{
          flex: 1, height: "100%", border: "none", cursor: "default",
          background: "rgba(0,0,0,0.25)", backdropFilter: "blur(4px)",
          transition: "background 180ms ease",
        }}
      />

      {/* Panel */}
      <aside
        className="animate-drawer scrollbar-thin"
        style={{
          width: "100%", maxWidth: 480, height: "100%",
          display: "flex", flexDirection: "column",
          background: "var(--surface)", borderLeft: "2px solid var(--txt)",
          boxShadow: "none",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 12, padding: "22px 24px", borderBottom: "2px solid var(--txt)",
          background: "var(--bg)", position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--muted)", marginBottom: 6 }}>
              Evidence
            </p>
            <h2 className="font-display" style={{ fontSize: "clamp(1.15rem, 2vw, 1.35rem)", fontWeight: 800, color: "var(--txt)", letterSpacing: "-0.03em" }}>{decision.criterion_id}</h2>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {criterionTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0, padding: "8px 16px", borderRadius: 0, cursor: "pointer",
              border: "2px solid var(--txt)", background: "var(--bg)",
              fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase",
              color: "var(--txt)", transition: "all 160ms ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--txt)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg)"; (e.currentTarget as HTMLElement).style.color = "var(--txt)"; }}
          >
            Close ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Meta grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Bidder",           value: decision.bidder_id },
              { label: "Extracted value",  value: ev.extracted_value === null || ev.extracted_value === undefined ? "—" : String(ev.extracted_value) },
              { label: "Document",         value: ev.doc_name ?? "—" },
              { label: "Page index",       value: String(ev.page_number ?? "—") },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--bg)", border: "1px solid var(--border-soft)", borderRadius: 0, padding: "12px 14px" }}>
                <p style={{ fontSize: 9, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted)", marginBottom: 4 }}>{item.label}</p>
                <p style={{ fontSize: 13, color: "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.value}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Source fragment */}
          <div>
            <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted)", marginBottom: 8 }}>
              Surface fragment
            </p>
            <pre style={{
              margin: 0, padding: "14px 16px", borderRadius: 0,
              border: "2px solid var(--txt)", background: "var(--bg)",
              fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7,
              color: "var(--frost)", maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }} className="scrollbar-thin">
              {ev.raw_text?.trim() || "No raw fragment persisted for this citation."}
            </pre>
          </div>

          {/* Confidence breakdown */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted)" }}>
                Confidence composition
              </p>
              <span className="font-display" style={{ fontSize: 22, fontWeight: 800, color: "var(--txt)", letterSpacing: "-0.03em" }}>
                {(bd.total * 100).toFixed(1)}%
              </span>
            </div>

            {/* Stacked bar */}
            <div style={{ display: "flex", height: 10, borderRadius: 0, overflow: "hidden", gap: 2, background: "var(--border-soft)", marginBottom: 12 }}>
              {FACTOR_META.map((f) => (
                <div
                  key={f.key}
                  style={{
                    flex: Math.max(bd[f.key], 0.005),
                    background: f.color,
                    transition: "flex 300ms ease",
                  }}
                  title={`${f.label} (${f.pct})`}
                />
              ))}
            </div>

            {/* Factor list */}
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {FACTOR_META.map((f) => (
                <li key={f.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--frost)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 0, background: f.color, flexShrink: 0 }} />
                    {f.label}
                    <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>({f.pct})</span>
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                    {(bd[f.key] * 100).toFixed(1)} pts
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Decision */}
          <div style={{ background: "var(--bg)", border: "2px solid var(--txt)", borderRadius: 0, padding: "18px 20px" }}>
            <span style={{
              display: "inline-block", padding: "6px 12px", borderRadius: 0,
              fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
              ...decisionStyle(decision.decision),
            }}>
              {decision.decision.replace(/_/g, " ")}
            </span>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--txt)", whiteSpace: "pre-wrap" }}>
              {decision.reasoning}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}