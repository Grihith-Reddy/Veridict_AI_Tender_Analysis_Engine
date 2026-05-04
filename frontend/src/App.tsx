import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatApiError, loadDemoSeed } from "./api";
import { AnomalyPanel } from "./components/AnomalyPanel";
import { BidderMatrix } from "./components/BidderMatrix";
import { CriteriaReview } from "./components/CriteriaReview";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { Upload } from "./components/Upload";
import { WizardProvider, useWizard, type WizardContextValue, type WizardStep } from "./context/WizardContext";
import type { DemoSeedResponse, VerdictDecision } from "./types";

/* ── Step config ─────────────────────────────────────────────────── */
const STEPS: { id: WizardStep; label: string; code: string }[] = [
  { id: "upload",   label: "Intake", code: "01" },
  { id: "criteria", label: "Criteria", code: "02" },
  { id: "matrix",   label: "Lattice", code: "03" },
];

function IconUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12M12 4l4 4M12 4l-4 4M5 20h14" />
    </svg>
  );
}
function IconCriteria() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function IconMatrix() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" /><rect x="14" y="14" width="6" height="6" rx="1.2" />
    </svg>
  );
}
const STEP_ICONS = [IconUpload, IconCriteria, IconMatrix];

/* ── Dot expand splash ───────────────────────────────────────────── */
function SplashOverlay({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"dot" | "expand" | "done">("dot");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Small delay then expand
    const t1 = setTimeout(() => setPhase("expand"), 500);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (phase !== "expand") return;
    const t = setTimeout(() => {
      setPhase("done");
      setTimeout(onComplete, 350);
    }, 800);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#ffffff",
        opacity: phase === "done" ? 0 : 1,
        transition: phase === "done" ? "opacity 0.35s ease" : "none",
        pointerEvents: phase === "done" ? "none" : "all",
      }}
    >
      <div
        style={{
          width: phase === "dot" ? 14 : "200vmax",
          height: phase === "dot" ? 14 : "200vmax",
          borderRadius: phase === "dot" ? "50%" : "50%",
          background: "#0a0a0a",
          transition: phase === "expand"
            ? "width 0.78s cubic-bezier(0.65,0,0.35,1), height 0.78s cubic-bezier(0.65,0,0.35,1)"
            : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {phase !== "dot" && (
          <span
            className="font-display"
            style={{
              fontWeight: 800,
              fontSize: "clamp(1.25rem, 4vw, 2rem)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.92)",
              opacity: phase === "expand" ? 1 : 0,
              transition: "opacity 0.35s ease 0.38s",
              whiteSpace: "nowrap",
            }}
          >
            Veridict
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Step rail (sidebar) ─────────────────────────────────────────── */
function StepRail() {
  const { step } = useWizard();
  const stepIndex = STEPS.findIndex((x) => x.id === step);

  return (
    <nav aria-label="Workflow steps">
      <p
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.22em",
          color: "var(--txt)",
          marginBottom: 14,
          paddingLeft: 4,
        }}
      >
        Flow
      </p>
      <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const completed = i < stepIndex;
          const Icon = STEP_ICONS[i];
          return (
            <li key={s.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 4px",
                  borderBottom: "1px solid var(--border-soft)",
                  background: active ? "var(--zebra)" : "transparent",
                  borderLeft: active ? "4px solid var(--txt)" : "4px solid transparent",
                  marginLeft: -4,
                  paddingLeft: 8,
                  transition: "background 160ms ease, border-color 160ms ease",
                  cursor: "default",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `2px solid ${active ? "var(--txt)" : completed ? "var(--eligible)" : "var(--border-soft)"}`,
                    color: active ? "var(--txt)" : completed ? "var(--eligible)" : "var(--muted)",
                    transition: "all 160ms ease",
                  }}
                >
                  <Icon />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      color: "var(--muted)",
                      lineHeight: 1,
                    }}
                  >
                    {s.code}
                  </p>
                  <p
                    className="font-display"
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: active ? "var(--txt)" : completed ? "var(--txt-2)" : "var(--muted)",
                      marginTop: 4,
                      lineHeight: 1.15,
                    }}
                  >
                    {s.label}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Global banner ───────────────────────────────────────────────── */
function GlobalBanner() {
  const { globalError, setGlobalError } = useWizard();
  if (!globalError) return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
      background: "rgba(196,30,30,0.06)", border: "2px solid rgba(196,30,30,0.35)",
      borderRadius: 0, padding: "14px 18px", marginBottom: 20,
      fontSize: 13, color: "var(--txt)",
    }}>
      <span>{globalError}</span>
      <button
        type="button"
        onClick={() => setGlobalError(null)}
        style={{
          flexShrink: 0, background: "none", border: "1px solid var(--border)",
          borderRadius: 0, padding: "6px 14px", fontSize: 11, cursor: "pointer",
          color: "var(--muted)", fontFamily: "var(--font-mono)", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

/* ── Matrix workspace ────────────────────────────────────────────── */
function MatrixWorkspace() {
  const { criteria } = useWizard();
  const [bottomTab, setBottomTab]           = useState<"legend" | "anomalies">("anomalies");
  const [drawerDecision, setDrawerDecision] = useState<VerdictDecision | null>(null);
  const idToCrit = Object.fromEntries(criteria.map((c) => [c.id, c]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <BidderMatrix onOpenEvidence={(d) => setDrawerDecision(d)} />
      <EvidenceDrawer
        open={Boolean(drawerDecision)}
        decision={drawerDecision}
        onClose={() => setDrawerDecision(null)}
        criterionTitle={drawerDecision ? idToCrit[drawerDecision.criterion_id]?.description ?? "" : ""}
      />

      {/* Bottom intel panel */}
      <div style={{ background: "var(--surface)", border: "2px solid var(--txt)", borderRadius: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "2px solid var(--txt)", background: "var(--bg)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--txt)", marginRight: 4 }}>
            Intelligence
          </span>
          <div style={{ display: "inline-flex", border: "2px solid var(--txt)", gap: 0 }}>
            {(["legend", "anomalies"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setBottomTab(tab)}
                style={{
                  padding: "8px 16px", border: "none", borderRight: tab === "legend" ? "2px solid var(--txt)" : "none", cursor: "pointer",
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.14em",
                  background: bottomTab === tab ? "var(--txt)" : "transparent",
                  color: bottomTab === tab ? "#fff" : "var(--muted)",
                  transition: "all 160ms ease",
                }}
              >
                {tab === "legend" ? "Legend" : "Anomalies"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "20px 20px" }}>
          {bottomTab === "legend" ? <LatticeLegend /> : <AnomalyPanel />}
        </div>
      </div>
    </div>
  );
}

function LatticeLegend() {
  const items = [
    { color: "var(--eligible)", label: "Eligible", desc: "Criterion satisfied within confidence envelope." },
    { color: "var(--deny)",     label: "Not eligible", desc: "Hard fail or threshold breach logged." },
    { color: "var(--review)",   label: "Needs review", desc: "Evidence insufficient or contradictory." },
  ];
  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))" }}>
      {items.map((item) => (
        <div key={item.label} style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          border: "1px solid var(--border-soft)", borderRadius: 0,
          background: "var(--bg)", padding: "14px 16px",
        }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 3 }} />
          <div>
            <p className="font-display" style={{ fontSize: 13, fontWeight: 700, color: "var(--txt)", marginBottom: 4 }}>{item.label}</p>
            <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>{item.desc}</p>
          </div>
        </div>
      ))}
      <div style={{
        gridColumn: "1 / -1",
        border: "2px dashed var(--border-soft)", borderRadius: 0,
        background: "var(--bg)", padding: "12px 16px",
        fontSize: 11, color: "var(--txt-2)", fontFamily: "var(--font-mono)", lineHeight: 1.55,
      }}>
        Select any lattice intersection to inspect provenance chain, OCR-weighted confidence, and deterministic reasoning.
      </div>
    </div>
  );
}

/* ── Hero section below upload ───────────────────────────────────── */
function HeroSection() {
  const stats = [
    { label: "Processing time", value: "< 30 min", sub: "vs 4–6 days manual" },
    { label: "Criteria extracted", value: "Auto", sub: "from legal language" },
    { label: "Audit trail", value: "SHA-256", sub: "tamper-evident chain" },
    { label: "Bidder anomalies", value: "Cross-check", sub: "IQR outlier detection" },
  ];
  return (
    <div style={{ marginTop: 56, paddingTop: 48, borderTop: "2px solid var(--txt)" }}>
      <p
        className="font-display"
        style={{
          fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          color: "var(--txt)",
          marginBottom: 8,
          lineHeight: 1.05,
        }}
      >
        Why teams use it
      </p>
      <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: 520, marginBottom: 28, lineHeight: 1.55 }}>
        Procurement-grade traceability: one surface, no decorative chrome.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 16, marginBottom: 0 }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--bg)",
              border: "2px solid var(--txt)",
              padding: "22px 20px",
            }}
          >
            <p className="font-display" style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", fontWeight: 800, color: "var(--txt)", letterSpacing: "-0.03em" }}>{s.value}</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)", marginTop: 8, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{s.label}</p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 20, marginTop: 32 }}>
        {[
          {
            title: "Evidence, not opinion",
            desc: "Each verdict ties to a document, page, and excerpt. Nothing disappears into a black box.",
            mark: "I",
          },
          {
            title: "Cross-bidder pressure",
            desc: "All bidders in one lattice so outliers and inconsistencies surface in context.",
            mark: "II",
          },
          {
            title: "Ambiguity before math",
            desc: "Unclear criteria are resolved explicitly before any scoring runs.",
            mark: "III",
          },
        ].map((f) => (
          <div
            key={f.title}
            style={{
              padding: "28px 24px",
              minHeight: 200,
              border: "2px solid var(--txt)",
            }}
          >
            <span className="font-display" style={{ fontSize: 48, fontWeight: 800, color: "var(--border-soft)", lineHeight: 1, display: "block", marginBottom: 12 }}>{f.mark}</span>
            <p className="font-display" style={{ fontSize: 17, fontWeight: 700, color: "var(--txt)", marginBottom: 10, letterSpacing: "-0.02em" }}>{f.title}</p>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Wizard body ─────────────────────────────────────────────────── */
function WizardBody() {
  const {
    step, setStep, sessionId, resetWizard,
    setTenderSession, setBidderRows, setBidderIdsOrdered,
    setCriteria, setCriteriaAmbiguousInitially,
    setDecisionsByBidder, setAnomalies, clearAnomalyReviews, setGlobalError,
  } = useWizard();

  const demoMutation = useMutation({
    mutationFn: loadDemoSeed,
    onMutate: () => setGlobalError(null),
    onSuccess: (data: DemoSeedResponse) => {
      applyDemoHydrate({ data, setTenderSession, setBidderRows, setBidderIdsOrdered, setCriteria, setCriteriaAmbiguousInitially, setDecisionsByBidder, setAnomalies, clearAnomalyReviews, setStep });
    },
    onError: (e: unknown) => setGlobalError(formatApiError(e)),
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", maxWidth: 1480, margin: "0 auto" }}>

      <aside style={{
        width: 248, flexShrink: 0, background: "var(--bg)",
        borderRight: "2px solid var(--txt)",
        display: "flex", flexDirection: "column",
        padding: "32px 20px",
        position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }}>
        <div style={{ marginBottom: 36, paddingLeft: 4 }}>
          <div style={{ marginBottom: 12 }}>
            <span
              className="font-display"
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "0.02em",
                color: "var(--txt)",
                display: "block",
                lineHeight: 1,
              }}
            >
              Veridict
            </span>
            <span
              style={{
                display: "inline-block",
                marginTop: 8,
                height: 4,
                width: "100%",
                maxWidth: 120,
                background: "var(--txt)",
              }}
              aria-hidden
            />
          </div>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", lineHeight: 1.5, letterSpacing: "0.01em" }}>
            Tender adjudication surface
          </p>
        </div>

        <StepRail />

        {/* Bottom controls */}
        <div style={{ marginTop: "auto", paddingTop: 28, borderTop: "2px solid var(--txt)", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            disabled={demoMutation.isPending}
            onClick={() => demoMutation.mutate()}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 0, cursor: demoMutation.isPending ? "wait" : "pointer",
              border: "2px solid var(--txt)", background: "var(--txt)", color: "#fff",
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase",
              transition: "opacity 160ms ease, transform 160ms ease",
            }}
            onMouseEnter={(e) => { if (!demoMutation.isPending) (e.currentTarget as HTMLElement).style.opacity = "0.88"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            {demoMutation.isPending ? "Loading…" : "Load demo"}
          </button>
          {step === "criteria" && (
            <button type="button" onClick={() => setStep("upload")} style={{ width: "100%", padding: "10px 16px", borderRadius: 0, cursor: "pointer", border: "2px solid var(--border-soft)", background: "transparent", color: "var(--txt)", fontSize: 12, fontWeight: 600, transition: "all 160ms ease" }}>
              ← Intake
            </button>
          )}
          {step === "matrix" && (
            <button type="button" onClick={() => setStep("criteria")} style={{ width: "100%", padding: "10px 16px", borderRadius: 0, cursor: "pointer", border: "2px solid var(--border-soft)", background: "transparent", color: "var(--txt)", fontSize: 12, fontWeight: 600, transition: "all 160ms ease" }}>
              ← Criteria
            </button>
          )}
          <button
            type="button"
            onClick={() => resetWizard()}
            style={{ width: "100%", padding: "10px 16px", borderRadius: 0, cursor: "pointer", border: "2px solid rgba(196,30,30,0.45)", background: "transparent", color: "var(--deny)", fontSize: 12, fontWeight: 600, transition: "all 160ms ease" }}
          >
            New session
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "36px 40px", overflowY: "auto" }}>

        <header style={{ marginBottom: 32, paddingBottom: 24, borderBottom: "2px solid var(--txt)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
            <div>
              <p
                className="font-display"
                style={{
                  fontSize: "clamp(2rem, 4vw, 2.75rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  color: "var(--txt)",
                  lineHeight: 1.02,
                  marginBottom: 10,
                }}
              >
                Session
              </p>
              {sessionId ? (
                <p style={{ fontSize: 14, marginTop: 0, color: "var(--txt)" }}>
                  <span style={{
                    border: "2px solid var(--txt)",
                    padding: "6px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    display: "inline-block",
                  }}>{sessionId}</span>
                </p>
              ) : (
                <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: 420, lineHeight: 1.55 }}>
                  No active session. Start from Intake or load the demo.
                </p>
              )}
            </div>
          </div>
        </header>

        <GlobalBanner />

        <main style={{ flex: 1 }}>
          <div key={step} className="animate-step-enter">
            {step === "upload"   && <><Upload /><HeroSection /></>}
            {step === "criteria" && <CriteriaReview />}
            {step === "matrix"   && <MatrixWorkspace />}
          </div>
        </main>

        <footer style={{ marginTop: 56, paddingTop: 24, borderTop: "2px solid var(--txt)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--muted)" }}>
          Internal adjudication — unauthorised disclosure prohibited.
        </footer>
      </div>
    </div>
  );
}

/* ── Splash wrapper ──────────────────────────────────────────────── */
function WizardShell() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <>
      {!splashDone && <SplashOverlay onComplete={() => setSplashDone(true)} />}
      <div style={{ opacity: splashDone ? 1 : 0, transition: "opacity 0.4s ease", animation: splashDone ? "appEnter 0.5s cubic-bezier(0.22,1,0.36,1) forwards" : "none" }}>
        <WizardBody />
      </div>
    </>
  );
}

export default function App() {
  return (
    <WizardProvider>
      <WizardShell />
    </WizardProvider>
  );
}

/* ── Demo hydrate (unchanged) ────────────────────────────────────── */
function applyDemoHydrate(args: {
  data: DemoSeedResponse;
  setTenderSession: WizardContextValue["setTenderSession"];
  setBidderRows: WizardContextValue["setBidderRows"];
  setBidderIdsOrdered: WizardContextValue["setBidderIdsOrdered"];
  setCriteria: WizardContextValue["setCriteria"];
  setCriteriaAmbiguousInitially: WizardContextValue["setCriteriaAmbiguousInitially"];
  setDecisionsByBidder: WizardContextValue["setDecisionsByBidder"];
  setAnomalies: WizardContextValue["setAnomalies"];
  clearAnomalyReviews: WizardContextValue["clearAnomalyReviews"];
  setStep: WizardContextValue["setStep"];
}) {
  const { data, setTenderSession, setBidderRows, setBidderIdsOrdered, setCriteria, setCriteriaAmbiguousInitially, setDecisionsByBidder, setAnomalies, clearAnomalyReviews, setStep } = args;
  setBidderRows([]);
  clearAnomalyReviews();
  setTenderSession({ sessionId: data.session_id, tenderId: data.tender_id, blockCount: data.tender_block_count, pages: data.tender_pages });
  setCriteriaAmbiguousInitially(data.ambiguous_initially);
  setBidderIdsOrdered(data.bidder_ids_ordered);
  setCriteria(data.criteria);
  setDecisionsByBidder(data.decisions);
  setAnomalies(data.anomalies);
  setStep("matrix");
}