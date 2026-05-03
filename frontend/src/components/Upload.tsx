import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { extractCriteria, formatApiError, uploadBidder, uploadTender } from "../api";
import { newRowId, useWizard, type BidderFileRow } from "../context/WizardContext";

function DropZone({
  label,
  subtitle,
  accept,
  multiple,
  filesSummary,
  onDropFiles,
}: {
  label: string;
  subtitle: string;
  accept: string;
  multiple?: boolean;
  filesSummary?: string;
  onDropFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const list = [...e.dataTransfer.files];
      if (list.length) onDropFiles(list);
    },
    [onDropFiles],
  );

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-xl border border-dashed p-6 transition-colors ${
        drag ? "border-accent bg-accent/10" : "border-line bg-panel/80 hover:border-frost/30"
      } shadow-hud`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        multiple={Boolean(multiple)}
        onChange={(e) => {
          const list = e.target.files ? [...e.target.files] : [];
          if (list.length) onDropFiles(list);
          e.target.value = "";
        }}
      />
      <div className="pointer-events-none text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{label}</p>
        <p className="mt-2 text-sm text-frost">{subtitle}</p>
        {filesSummary && <p className="mt-3 font-mono text-xs text-muted">{filesSummary}</p>}
      </div>
    </div>
  );
}

export function Upload() {
  const {
    sessionId,
    setTenderSession,
    tenderStats,
    tenderId,
    bidderRows,
    setBidderRows,
    setBidderIdsOrdered,
    setCriteria,
    setCriteriaAmbiguousInitially,
    setStep,
    setGlobalError,
  } = useWizard();

  const [tenderFile, setTenderFile] = useState<File | null>(null);

  const extractionMutation = useMutation({
    mutationFn: async () => {
      if (!tenderFile) throw new Error("Select the tender package.");
      if (bidderRows.length === 0 || bidderRows.some((r) => !r.file || !r.bidderName.trim()))
        throw new Error("Every bidder row needs a document and bidder name.");

      setGlobalError(null);
      const t = await uploadTender(tenderFile);
      setTenderSession({
        sessionId: t.session_id,
        tenderId: t.tender_id,
        blockCount: t.block_count,
        pages: t.pages,
      });

      const ordered: string[] = [];
      for (const row of bidderRows) {
        const file = row.file;
        if (!file) throw new Error("Incomplete bidder attachment.");
        const resp = await uploadBidder({
          file,
          sessionId: t.session_id,
          bidderName: row.bidderName.trim(),
        });
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

  function addBidderRow() {
    setBidderRows((prev) => [...prev, { id: newRowId(), file: null, bidderName: "" }]);
  }

  function setRowFile(rowId: string, file: File) {
    setBidderRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, file } : r)),
    );
  }

  function setRowName(rowId: string, bidderName: string) {
    setBidderRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, bidderName } : r)),
    );
  }

  function removeRow(rowId: string) {
    setBidderRows((prev) => prev.filter((r) => r.id !== rowId));
  }

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

  const canExtract =
    Boolean(tenderFile) &&
    bidderRows.length > 0 &&
    bidderRows.every((r) => r.file && r.bidderName.trim());

  return (
    <div className="animate-fade-slide space-y-8">
      <header className="border-b border-line pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Phase 01 — Ingest</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-txt">Classified Procurement Intake</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Upload the tender dossier once, attach each bidder filing with an explicit bidder identifier. Verification chain starts at document boundary.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <DropZone
          label="Tender dossier"
          subtitle="PDF or DOCX — single canonical package."
          accept=".pdf,.doc,.docx,application/pdf"
          multiple={false}
          filesSummary={
            tenderFile
              ? `${tenderFile.name} · ready`
              : sessionId && tenderId
                ? `Session ${sessionId.slice(0, 8)}… (${tenderStats?.pages ?? "?"} pg)`
                : undefined
          }
          onDropFiles={(files) => {
            const f = files.find((x) => /pdf|document|word/i.test(x.type) || /\.pdf$/i.test(x.name));
            if (f) setTenderFile(f);
          }}
        />

        <div className="space-y-3 rounded-xl border border-line bg-surface p-5 shadow-hud">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-widest text-review">Bidder filings</p>
            <button
              type="button"
              onClick={addBidderRow}
              className="rounded border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-frost hover:border-accent hover:text-accent"
            >
              + Row
            </button>
          </div>
          <DropZone
            label="Bidder uploads"
            subtitle="Multiple files accepted — merges into rows below."
            accept=".pdf,.doc,.docx"
            multiple
            filesSummary={`${bidderRows.filter((r) => r.file).length}/${bidderRows.length} files bound`}
            onDropFiles={onBidderFilesDropped}
          />

          <div className="max-h-64 space-y-2 overflow-auto scrollbar-thin pr-1">
            {bidderRows.length === 0 && (
              <p className="py-6 text-center font-mono text-xs text-muted">No bidder rows — drop files or add a row.</p>
            )}
            {bidderRows.map((row: BidderFileRow) => (
              <div key={row.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-panel px-3 py-2">
                <label className="min-w-[140px] flex-1 text-[11px] text-muted">
                  <span className="font-mono uppercase tracking-wide text-frost">Bidder id / name</span>
                  <input
                    value={row.bidderName}
                    onChange={(e) => setRowName(row.id, e.target.value)}
                    placeholder="Registered entity name"
                    className="mt-1 w-full rounded border border-line bg-navy px-2 py-1.5 font-sans text-sm text-txt placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="font-mono text-[10px] text-muted">
                  <span className="block uppercase tracking-wide text-frost">Document</span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="mt-1 max-w-[160px] text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-accent/20 file:px-2 file:py-1 file:text-[10px] file:text-accent"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setRowFile(row.id, f);
                    }}
                  />
                </label>
                {row.file && <span className="font-mono text-[10px] text-eligible truncate max-w-[120px]" title={row.file.name}>{row.file.name}</span>}
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="ml-auto shrink-0 px-2 font-mono text-[10px] uppercase text-deny hover:underline"
                >
                  Drop
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <button
          type="button"
          disabled={!canExtract || extractionMutation.isPending}
          onClick={() => extractionMutation.mutate()}
          className="rounded bg-accent px-6 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-[0_0_24px_rgba(59,130,246,0.35)] disabled:opacity-40 disabled:shadow-none hover:bg-accent/90"
        >
          {extractionMutation.isPending ? "Extracting…" : "Begin Extraction"}
        </button>
        {tenderStats && (
          <span className="font-mono text-xs text-muted">
            Last tender ingest: blocks {tenderStats.blockCount} · pages {tenderStats.pages}
          </span>
        )}
      </div>
    </div>
  );
}

function deriveNameFromFile(name: string) {
  return name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").slice(0, 48);
}
