import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { extractCriteria, formatApiError, uploadBidder, uploadTender } from "../api";
import { newRowId, useWizard, type BidderFileRow } from "../context/WizardContext";

function DropZone({ label, subtitle, accept, multiple, filesSummary, onDropFiles }: {
  label: string; subtitle: string; accept: string;
  multiple?: boolean; filesSummary?: string;
  onDropFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag]   = useState(false);
  const [hover, setHover] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const list = [...e.dataTransfer.files];
    if (list.length) onDropFiles(list);
  }, [onDropFiles]);

  const active = drag || hover;

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => inputRef.current?.click()}
      style={{
        position: "relative", cursor: "pointer", borderRadius: 0,
        border: `2px dashed ${active ? "var(--txt)" : "var(--border-soft)"}`,
        padding: "36px 24px", textAlign: "center",
        background: active ? "var(--zebra)" : "var(--bg)",
        transition: "all 160ms ease",
        boxShadow: active ? "inset 0 0 0 2px var(--txt)" : "none",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        multiple={Boolean(multiple)}
        onChange={(e) => {
          const list = e.target.files ? [...e.target.files] : [];
          if (list.length) onDropFiles(list);
          e.target.value = "";
        }}
      />
      <div style={{
        width: 44, height: 44, borderRadius: 0,
        border: `2px solid ${active ? "var(--txt)" : "var(--border-soft)"}`,
        background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 14px", transition: "all 160ms ease",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--txt)" : "var(--muted)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v12M12 4l4 4M12 4l-4 4M5 20h14" />
        </svg>
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--txt)" : "var(--txt-2)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 11, color: "var(--muted)" }}>{subtitle}</p>
      {filesSummary && (
        <p style={{ marginTop: 8, fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--eligible)", border: "2px solid var(--eligible)", borderRadius: 0, display: "inline-block", padding: "4px 10px" }}>
          ✓ {filesSummary}
        </p>
      )}
    </div>
  );
}

export function Upload() {
  const {
    sessionId, setTenderSession, tenderStats, tenderId,
    bidderRows, setBidderRows, setBidderIdsOrdered,
    setCriteria, setCriteriaAmbiguousInitially, setStep, setGlobalError,
  } = useWizard();

  const [tenderFile, setTenderFile] = useState<File | null>(null);

  const extractionMutation = useMutation({
    mutationFn: async () => {
      if (!tenderFile) throw new Error("Select the tender package.");
      if (bidderRows.length === 0 || bidderRows.some((r) => !r.file || !r.bidderName.trim()))
        throw new Error("Every bidder row needs a document and bidder name.");
      setGlobalError(null);
      const t = await uploadTender(tenderFile);
      setTenderSession({ sessionId: t.session_id, tenderId: t.tender_id, blockCount: t.block_count, pages: t.pages });
      const ordered: string[] = [];
      for (const row of bidderRows) {
        const file = row.file;
        if (!file) throw new Error("Incomplete bidder attachment.");
        const resp = await uploadBidder({ file, sessionId: t.session_id, bidderName: row.bidderName.trim() });
        ordered.push(resp.bidder_id);
      }
      setBidderIdsOrdered(ordered);
      const crit = await extractCriteria(t.session_id);
      setCriteriaAmbiguousInitially(crit.ambiguous_count);
      setCriteria(crit.criteria);
      setStep("criteria");
    },
    onError: (err: unknown) => setGlobalError(formatApiError(err)),
  });

  function addBidderRow() { setBidderRows((prev) => [...prev, { id: newRowId(), file: null, bidderName: "" }]); }
  function setRowFile(id: string, file: File) { setBidderRows((prev) => prev.map((r) => r.id === id ? { ...r, file } : r)); }
  function setRowName(id: string, name: string) { setBidderRows((prev) => prev.map((r) => r.id === id ? { ...r, bidderName: name } : r)); }
  function removeRow(id: string) { setBidderRows((prev) => prev.filter((r) => r.id !== id)); }
  function onBidderFilesDropped(files: File[]) {
    setBidderRows((prev) => {
      let next = [...prev];
      for (const f of files) {
        const empty = next.findIndex((r) => !r.file);
        if (empty >= 0) next[empty] = { ...next[empty], file: f, bidderName: next[empty].bidderName || deriveNameFromFile(f.name) };
        else next.push({ id: newRowId(), file: f, bidderName: deriveNameFromFile(f.name) });
      }
      return next;
    });
  }

  const canExtract = Boolean(tenderFile) && bidderRows.length > 0 && bidderRows.every((r) => r.file && r.bidderName.trim());

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "var(--txt)", border: "2px solid var(--txt)", padding: "4px 10px" }}>01</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--muted)" }}>Intake</span>
        </div>
        <h1 className="font-display" style={{ fontSize: "clamp(1.85rem, 3.2vw, 2.5rem)", fontWeight: 800, color: "var(--txt)", letterSpacing: "-0.04em", marginBottom: 8, lineHeight: 1.05 }}>Document intake</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: 520, lineHeight: 1.55 }}>
          Tender package plus each bidder filing, named explicitly. Traceability starts at the file boundary.
        </p>
      </div>

      {/* Upload grid */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", marginBottom: 28 }}>

        {/* Tender */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: "var(--frost)", marginBottom: 8, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Tender Dossier</p>
          <DropZone
            label="Drop tender document"
            subtitle="PDF or DOCX — single canonical package"
            accept=".pdf,.doc,.docx,application/pdf"
            multiple={false}
            filesSummary={tenderFile ? `${tenderFile.name} · ready` : sessionId && tenderId ? `Session ${sessionId.slice(0,8)}… · ${tenderStats?.pages ?? "?"} pages` : undefined}
            onDropFiles={(files) => {
              const f = files.find((x) => /pdf|document|word/i.test(x.type) || /\.pdf$/i.test(x.name));
              if (f) setTenderFile(f);
            }}
          />
        </div>

        {/* Bidder panel */}
        <div style={{ background: "var(--surface)", border: "2px solid var(--txt)", borderRadius: 0, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--txt)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.14em" }}>Bidders</p>
            <button
              type="button"
              onClick={addBidderRow}
              style={{
                padding: "8px 14px", borderRadius: 0, cursor: "pointer",
                border: "2px solid var(--txt)", background: "var(--bg)",
                color: "var(--txt)", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 160ms ease",
              }}
            >
              + Row
            </button>
          </div>

          <DropZone
            label="Bidder uploads"
            subtitle="Multiple files — merges into rows below"
            accept=".pdf,.doc,.docx"
            multiple
            filesSummary={`${bidderRows.filter((r) => r.file).length} / ${bidderRows.length} files bound`}
            onDropFiles={onBidderFilesDropped}
          />

          <div style={{ marginTop: 12, maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }} className="scrollbar-thin">
            {bidderRows.length === 0 && (
              <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", padding: "20px 0", fontFamily: "var(--font-mono)" }}>
                No bidder rows — drop files or add a row.
              </p>
            )}
            {bidderRows.map((row: BidderFileRow, idx) => (
              <div key={row.id} style={{
                display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 8,
                padding: "12px 14px", borderRadius: 0, border: "1px solid var(--border-soft)",
                background: idx % 2 === 0 ? "var(--zebra)" : "var(--surface)",
              }}>
                <label style={{ flex: 1, minWidth: 130 }}>
                  <span style={{ display: "block", fontSize: 10, fontWeight: 500, color: "var(--muted)", marginBottom: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Bidder name</span>
                  <input value={row.bidderName} onChange={(e) => setRowName(row.id, e.target.value)} placeholder="Registered entity name" />
                </label>
                <label>
                  <span style={{ display: "block", fontSize: 10, fontWeight: 500, color: "var(--muted)", marginBottom: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Document</span>
                  <input
                    type="file" accept=".pdf,.doc,.docx"
                    style={{ fontSize: 11, color: "var(--muted)", width: "auto", background: "none", border: "none", padding: 0 }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setRowFile(row.id, f); }}
                  />
                </label>
                {row.file && (
                  <span style={{ fontSize: 10, color: "var(--eligible)", fontFamily: "var(--font-mono)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.file.name}>
                    ✓ {row.file.name}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--deny)", fontWeight: 500 }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <button
          type="button"
          disabled={!canExtract || extractionMutation.isPending}
          onClick={() => extractionMutation.mutate()}
          style={{
            padding: "14px 32px", borderRadius: 0, cursor: canExtract && !extractionMutation.isPending ? "pointer" : "not-allowed",
            border: "2px solid var(--txt)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase",
            color: canExtract && !extractionMutation.isPending ? "#fff" : "var(--muted)",
            background: canExtract && !extractionMutation.isPending ? "var(--txt)" : "var(--bg)",
            transition: "all 180ms ease",
          }}
        >
          {extractionMutation.isPending ? "Extracting…" : "Extract criteria"}
        </button>
        {tenderStats && (
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            Last ingest: {tenderStats.blockCount} blocks · {tenderStats.pages} pages
          </span>
        )}
      </div>
    </div>
  );
}

function deriveNameFromFile(name: string) {
  return name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").slice(0, 48);
}