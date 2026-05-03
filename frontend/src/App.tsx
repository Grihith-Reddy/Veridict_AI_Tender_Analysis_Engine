import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { formatApiError, loadDemoSeed } from "./api";
import { AnomalyPanel } from "./components/AnomalyPanel";
import { BidderMatrix } from "./components/BidderMatrix";
import { CriteriaReview } from "./components/CriteriaReview";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { Upload } from "./components/Upload";
import { WizardProvider, useWizard, type WizardContextValue, type WizardStep } from "./context/WizardContext";
import type { DemoSeedResponse, VerdictDecision } from "./types";

/* ── Splash screen ─────────────────────────────────────────────────────────── */
function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="splash-root">
      <div className="splash-pill">
        <span className="splash-dot" />
        <span className="splash-wordmark">VERIDICT</span>
        <span className="splash-dot" />
      </div>
      <p className="splash-sub">Evidence-Based Decision Intelligence</p>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne+Mono&family=DM+Sans:wght@300;400;500&display=swap');

        :root {
          --navy:    #080d18;
          --surface: #0d1525;
          --panel:   #111d30;
          --border:  rgba(99,132,199,0.18);
          --accent:  #4f8ef7;
          --frost:   #a8c4ff;
          --muted:   #5a7097;
          --txt:     #dce8ff;
          --eligible:#22d48f;
          --deny:    #f05b5b;
          --review:  #f4a14a;
          --line:    rgba(99,132,199,0.14);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: var(--navy);
          color: var(--txt);
          font-family: 'DM Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .splash-root {
          position: fixed; inset: 0; z-index: 9999;
          background: var(--navy);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 20px;
          animation: splashFade 0.5s ease 2.1s forwards;
        }
        @keyframes splashFade { to { opacity: 0; pointer-events: none; } }

        .splash-pill {
          display: flex; align-items: center; gap: 14px;
          background: var(--panel);
          border: 1px solid rgba(79,142,247,0.35);
          border-radius: 999px;
          padding: 14px 32px;
          animation: pillIn 0.7s cubic-bezier(0.16,1,0.3,1) both;
          box-shadow: 0 0 60px rgba(79,142,247,0.12), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        @keyframes pillIn {
          from { opacity: 0; transform: scale(0.82) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        .splash-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--accent);
          animation: dotPulse 1.2s ease-in-out infinite alternate;
          box-shadow: 0 0 10px var(--accent);
        }
        .splash-dot:last-child { animation-delay: 0.3s; }
        @keyframes dotPulse { to { opacity: 0.3; } }

        .splash-wordmark {
          font-family: 'Syne Mono', monospace;
          font-size: 22px;
          letter-spacing: 0.28em;
          color: var(--txt);
        }

        .splash-sub {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 300;
          letter-spacing: 0.18em;
          color: var(--muted);
          text-transform: uppercase;
          animation: subIn 0.6s ease 0.4s both;
        }
        @keyframes subIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

        /* ── App shell ───────────────────────────────────────────────────── */
        .vd-shell {
          min-height: 100vh;
          background: var(--navy);
          background-image:
            radial-gradient(ellipse 60% 40% at 70% 0%, rgba(79,142,247,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 10% 80%, rgba(34,212,143,0.04) 0%, transparent 60%);
        }

        .vd-inner {
          max-width: 1600px; margin: 0 auto;
          padding: 2.5rem 2.5rem 4rem;
          animation: appIn 0.6s ease 2.3s both;
        }
        @keyframes appIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

        /* Header */
        .vd-header {
          display: flex; flex-wrap: wrap;
          align-items: flex-start; justify-content: space-between; gap: 1.5rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 2rem; margin-bottom: 2rem;
        }
        .vd-logo-row {
          display: flex; align-items: center; gap: 10px;
          font-family: 'Syne Mono', monospace;
          font-size: 10px; letter-spacing: 0.32em;
          color: var(--accent); text-transform: uppercase;
          margin-bottom: 12px;
        }
        .vd-logo-sep { color: var(--muted); }
        .vd-logo-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          animation: dotPulse 1.4s ease-in-out infinite alternate;
        }
        .vd-tagline {
          font-size: 13px; font-weight: 300; line-height: 1.7;
          color: var(--muted); max-width: 480px; margin-bottom: 10px;
        }
        .vd-session-id {
          font-family: 'Syne Mono', monospace;
          font-size: 10px; color: var(--muted);
          letter-spacing: 0.06em;
        }
        .vd-session-id span { color: var(--frost); }

        /* Header buttons */
        .vd-hdr-btns {
          display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start;
          font-family: 'Syne Mono', monospace;
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em;
        }
        .vd-btn {
          padding: 8px 18px; border-radius: 6px; cursor: pointer;
          border: 1px solid; transition: all 0.18s ease;
          font-family: 'Syne Mono', monospace;
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em;
          background: transparent;
        }
        .vd-btn-demo {
          border-color: rgba(79,142,247,0.45);
          background: rgba(79,142,247,0.1);
          color: var(--accent);
        }
        .vd-btn-demo:hover:not(:disabled) { background: rgba(79,142,247,0.2); }
        .vd-btn-demo:disabled { opacity: 0.4; cursor: not-allowed; }
        .vd-btn-nav {
          border-color: var(--border);
          color: var(--frost);
        }
        .vd-btn-nav:hover { border-color: var(--accent); color: var(--accent); }
        .vd-btn-reset {
          border-color: rgba(240,91,91,0.3);
          color: var(--deny);
        }
        .vd-btn-reset:hover { background: rgba(240,91,91,0.08); }

        /* Step rail */
        .vd-rail {
          display: flex; flex-wrap: wrap; align-items: center; gap: 16px;
          border-bottom: 1px solid var(--border); padding-bottom: 1.2rem;
          margin-bottom: 2rem;
        }
        .vd-rail-label {
          font-family: 'Syne Mono', monospace;
          font-size: 9px; letter-spacing: 0.28em;
          text-transform: uppercase; color: var(--muted);
        }
        .vd-rail-steps {
          display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
          list-style: none;
        }
        .vd-rail-step {
          display: flex; align-items: center; gap: 8px;
        }
        .vd-rail-connector {
          height: 1px; width: 28px; flex-shrink: 0;
        }
        .vd-step-pill {
          display: flex; align-items: center; gap: 8px;
          border: 1px solid; border-radius: 6px;
          padding: 6px 12px;
          font-family: 'Syne Mono', monospace; font-size: 10px;
          transition: all 0.2s ease;
        }
        .vd-step-code { letter-spacing: 0.14em; font-size: 9px; }

        /* Global banner */
        .vd-banner {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
          border: 1px solid rgba(240,91,91,0.4);
          background: rgba(240,91,91,0.08);
          border-radius: 8px; padding: 12px 16px;
          margin-bottom: 1.5rem;
          font-family: 'Syne Mono', monospace; font-size: 12px;
          color: var(--deny);
        }
        .vd-banner-dismiss {
          background: none; border: none; cursor: pointer;
          font-family: 'Syne Mono', monospace; font-size: 9px;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--txt); text-decoration: underline;
          flex-shrink: 0;
        }

        /* Matrix workspace */
        .vd-matrix-wrap { display: flex; flex-direction: column; gap: 2rem; }

        .vd-bottom-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: rgba(13,21,37,0.85);
          backdrop-filter: blur(8px);
          overflow: hidden;
        }
        .vd-bottom-tabs {
          display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
          border-bottom: 1px solid var(--border);
          background: rgba(8,13,24,0.8);
          padding: 10px 14px;
        }
        .vd-bottom-tab-label {
          font-family: 'Syne Mono', monospace;
          font-size: 9px; text-transform: uppercase; letter-spacing: 0.22em;
          color: var(--muted); margin-right: 4px;
        }
        .vd-tab-group {
          display: inline-flex; background: var(--navy);
          border: 1px solid var(--border); border-radius: 8px; padding: 3px;
        }
        .vd-tab {
          border-radius: 6px; padding: 7px 16px; cursor: pointer;
          border: none; background: transparent;
          font-family: 'Syne Mono', monospace;
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
          transition: all 0.15s ease;
        }
        .vd-tab-active { background: var(--accent); color: #fff; }
        .vd-tab-inactive { color: var(--muted); }
        .vd-tab-inactive:hover { color: var(--txt); }
        .vd-bottom-body { padding: 20px; }

        /* Legend */
        .vd-legend {
          display: grid; gap: 10px;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          font-family: 'Syne Mono', monospace; font-size: 10px; color: var(--muted);
        }
        .vd-legend-item {
          display: flex; align-items: center; gap: 10px;
          border: 1px solid var(--border); border-radius: 7px;
          background: var(--navy); padding: 10px 12px;
        }
        .vd-legend-dot {
          width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
        }
        .vd-legend-note {
          grid-column: 1 / -1;
          border: 1px dashed rgba(79,142,247,0.3);
          background: rgba(79,142,247,0.05);
          border-radius: 7px; padding: 10px 12px;
          color: var(--accent); font-size: 10px;
          font-family: 'Syne Mono', monospace;
        }

        /* Footer */
        .vd-footer {
          margin-top: 4rem; border-top: 1px solid var(--border);
          padding-top: 1.5rem;
          font-family: 'Syne Mono', monospace;
          font-size: 9px; text-transform: uppercase;
          letter-spacing: 0.2em; color: var(--muted);
          display: flex; align-items: center; gap: 10px;
        }
        .vd-footer::before {
          content: '';
          display: inline-block; width: 4px; height: 4px;
          border-radius: 50%; background: var(--deny);
          box-shadow: 0 0 6px var(--deny);
        }
      `}</style>
    </div>
  );
}

/* ── Step Rail ─────────────────────────────────────────────────────────────── */
const STEPS: { id: WizardStep; label: string; code: string }[] = [
  { id: "upload",   label: "Intake",              code: "P01" },
  { id: "criteria", label: "Interpretation Gate", code: "P02" },
  { id: "matrix",   label: "Adjudication Lattice",code: "P03" },
];

function StepRail() {
  const { step } = useWizard();
  const stepIndex = STEPS.findIndex((x) => x.id === step);

  return (
    <nav className="vd-rail">
      <p className="vd-rail-label">Protocol</p>
      <ol className="vd-rail-steps">
        {STEPS.map((s, i) => {
          const active    = s.id === step;
          const completed = i < stepIndex;
          return (
            <li key={s.id} className="vd-rail-step">
              {i > 0 && (
                <span
                  className="vd-rail-connector"
                  style={{ background: completed || active ? "rgba(79,142,247,0.4)" : "var(--border)" }}
                  aria-hidden
                />
              )}
              <div
                className="vd-step-pill"
                style={
                  active
                    ? { borderColor: "rgba(79,142,247,0.55)", background: "rgba(79,142,247,0.12)", color: "var(--accent)" }
                    : completed
                    ? { borderColor: "rgba(34,212,143,0.35)", background: "rgba(34,212,143,0.08)", color: "var(--eligible)" }
                    : { borderColor: "var(--border)", background: "var(--panel)", color: "var(--muted)" }
                }
              >
                <span className="vd-step-code">{s.code}</span>
                <span>{s.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Global Banner ─────────────────────────────────────────────────────────── */
function GlobalBanner() {
  const { globalError, setGlobalError } = useWizard();
  if (!globalError) return null;
  return (
    <div className="vd-banner">
      <span>{globalError}</span>
      <button type="button" onClick={() => setGlobalError(null)} className="vd-banner-dismiss">
        Dismiss
      </button>
    </div>
  );
}

/* ── Matrix Workspace ──────────────────────────────────────────────────────── */
function MatrixWorkspace() {
  const { criteria } = useWizard();
  const [bottomTab, setBottomTab]       = useState<"legend" | "anomalies">("anomalies");
  const [drawerDecision, setDrawerDecision] = useState<VerdictDecision | null>(null);
  const idToCrit = useMemo(() => Object.fromEntries(criteria.map((c) => [c.id, c])), [criteria]);

  return (
    <div className="vd-matrix-wrap">
      <BidderMatrix onOpenEvidence={(d) => setDrawerDecision(d)} />
      <EvidenceDrawer
        open={Boolean(drawerDecision)}
        decision={drawerDecision}
        onClose={() => setDrawerDecision(null)}
        criterionTitle={drawerDecision ? idToCrit[drawerDecision.criterion_id]?.description ?? "" : ""}
      />

      <div className="vd-bottom-card">
        <div className="vd-bottom-tabs">
          <span className="vd-bottom-tab-label">Supporting intelligence</span>
          <div className="vd-tab-group">
            <button
              type="button"
              onClick={() => setBottomTab("legend")}
              className={`vd-tab ${bottomTab === "legend" ? "vd-tab-active" : "vd-tab-inactive"}`}
            >
              Lattice legend
            </button>
            <button
              type="button"
              onClick={() => setBottomTab("anomalies")}
              className={`vd-tab ${bottomTab === "anomalies" ? "vd-tab-active" : "vd-tab-inactive"}`}
            >
              Integrity anomalies
            </button>
          </div>
        </div>
        <div className="vd-bottom-body">
          {bottomTab === "legend" ? <LatticeLegend /> : <AnomalyPanel />}
        </div>
      </div>
    </div>
  );
}

function LatticeLegend() {
  return (
    <div className="vd-legend">
      <div className="vd-legend-item">
        <span className="vd-legend-dot" style={{ background: "var(--eligible)", boxShadow: "0 0 8px rgba(34,212,143,0.5)" }} />
        Eligible — criterion satisfied within confidence envelope.
      </div>
      <div className="vd-legend-item">
        <span className="vd-legend-dot" style={{ background: "var(--deny)", boxShadow: "0 0 8px rgba(240,91,91,0.5)" }} />
        Not eligible — hard fail or threshold breach logged.
      </div>
      <div className="vd-legend-item">
        <span className="vd-legend-dot" style={{ background: "var(--review)", boxShadow: "0 0 8px rgba(244,161,74,0.5)" }} />
        Needs manual review — evidence insufficient or contradictory.
      </div>
      <p className="vd-legend-note">
        Select any lattice intersection to inspect provenance chain, OCR-weighted confidence, and deterministic reasoning text.
      </p>
    </div>
  );
}

/* ── Wizard Body ───────────────────────────────────────────────────────────── */
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
      applyDemoHydrate({
        data, setTenderSession, setBidderRows, setBidderIdsOrdered,
        setCriteria, setCriteriaAmbiguousInitially,
        setDecisionsByBidder, setAnomalies, clearAnomalyReviews, setStep,
      });
    },
    onError: (e: unknown) => setGlobalError(formatApiError(e)),
  });

  return (
    <div className="vd-shell">
      <div className="vd-inner">
        {/* Header */}
        <header className="vd-header">
          <div>
            <div className="vd-logo-row">
              <span className="vd-logo-dot" />
              <span>Veridict</span>
              <span className="vd-logo-sep">/</span>
              <span style={{ color: "var(--muted)" }}>Tender adjudication workstation</span>
            </div>
            <p className="vd-tagline">
              Deterministic ingestion, criteria arbitration, lattice-grade bid evaluation.
              Controlled chain of custody across document ingestion and adjudication artefacts.
            </p>
            {sessionId && (
              <p className="vd-session-id">
                Session:&nbsp;<span>{sessionId}</span>
              </p>
            )}
          </div>

          <div className="vd-hdr-btns">
            <button
              type="button"
              disabled={demoMutation.isPending}
              onClick={() => demoMutation.mutate()}
              className="vd-btn vd-btn-demo"
            >
              {demoMutation.isPending ? "Loading demo…" : "Load Demo"}
            </button>
            {step === "criteria" && (
              <button type="button" onClick={() => setStep("upload")} className="vd-btn vd-btn-nav">
                ← Intake
              </button>
            )}
            {step === "matrix" && (
              <button type="button" onClick={() => setStep("criteria")} className="vd-btn vd-btn-nav">
                ← Arbitration
              </button>
            )}
            <button type="button" onClick={() => resetWizard()} className="vd-btn vd-btn-reset">
              New session
            </button>
          </div>
        </header>

        <StepRail />
        <GlobalBanner />

        <main>
          {step === "upload"   && <Upload />}
          {step === "criteria" && <CriteriaReview />}
          {step === "matrix"   && <MatrixWorkspace />}
        </main>

        <footer className="vd-footer">
          Internal adjudication conduit — unauthorised disclosure prohibited
        </footer>
      </div>
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────────────────────── */
export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <WizardProvider>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <WizardBody />
    </WizardProvider>
  );
}

/* ── Demo hydrate helper (unchanged) ──────────────────────────────────────── */
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
  const {
    data, setTenderSession, setBidderRows, setBidderIdsOrdered,
    setCriteria, setCriteriaAmbiguousInitially,
    setDecisionsByBidder, setAnomalies, clearAnomalyReviews, setStep,
  } = args;
  setBidderRows([]);
  clearAnomalyReviews();
  setTenderSession({
    sessionId: data.session_id,
    tenderId: data.tender_id,
    blockCount: data.tender_block_count,
    pages: data.tender_pages,
  });
  setCriteriaAmbiguousInitially(data.ambiguous_initially);
  setBidderIdsOrdered(data.bidder_ids_ordered);
  setCriteria(data.criteria);
  setDecisionsByBidder(data.decisions);
  setAnomalies(data.anomalies);
  setStep("matrix");
}