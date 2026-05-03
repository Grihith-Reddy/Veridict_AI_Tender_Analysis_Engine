# Veridict

Veridict is an institutional-grade adjudication workstation for procurement compliance. It ingests tender packages and bidder dossiers, extracts structured eligibility criteria from the tender corpus, resolves ambiguous mandates through an arbitration gate, and executes a deterministic evaluation lattice that scores each bidder against each criterion with evidence-backed provenance.

The backend couples document ingestion (PDF / DOCX and routed OCR pathways), lexical and embedding retrieval against bidder text surfaces, calibrated confidence decomposition, anomaly detection across bidders, and audit-grade logging. The React frontend presents a phased workflow—intake, criteria review, lattice matrix, and anomaly intelligence—optimized for auditors and tender offices that require clarity alongside traceability.

## Architecture

```
+------------------+          +---------------------------------------------+
|  React Client    |  HTTPS |  FastAPI (Veridict API)                     |
|  (Vite :3000)    +------->|  /api/upload  /api/evaluate  /api/demo/seed|
+--------+---------+        +--------+------+-------------+----------------+
         |                           |      |                             |
         |                           v      v                             |
         |                     +----+------+--------+    +---------------+
         |                     | EvaluationSession |    | SQLite ORM      |
         |                     | store (RAM)       |--->| (decisions/run) |
         |                     +---------+---------+    +--------+--------+
         |                               |                       |
         v                               v                       v
+--------+---------+           +--------+----------+      +----+------------+
| IBM Plex HUD UI |           | DocProbe Engine   |      | Tender / bidder|
| Evidence drawer |           | Verdict Core      |      | artefacts      |
+-------------------+           +---------+--------+      +----+------------+
                                           |
                                           v
                                 +----+----------+
                                 | Consistency /
                                 | anomalies     |
                                 +----+----------+
                                           |
                                           v
                                 +----+----------+
                                 | /tmp/veridict|
                                 |_audit uploads |
                                 +---------------+
```

## Setup

1. Clone this repository.

2. From the repository root copy the environment template and add your secret:

   ```
   cp .env.example .env
   ```

   Edit `.env` and set `GEMINI_API_KEY` (from [Google AI Studio](https://aistudio.google.com/apikey)). The pipeline calls **Gemini 2.0 Flash** (`gemini-2.0-flash` by default) for criteria extraction, evidence LLM parsing, and semantic verdicts; without a key, regex and keyword fallbacks still run but coverage is lower. Optional: set `GEMINI_MODEL` to another supported model id.

3. Start backend and frontend with Docker Compose:

   ```
   docker compose up --build
   ```

   Backend listens on http://localhost:8000 (`/health` for readiness).

   Frontend dev server listens on http://localhost:3000.

   Named volumes isolate `/tmp/veridict_uploads` and `/tmp/veridict_audit` inside the backend container while persisting SQLite and storage under `./backend/storage` via bind mount.

## Demo

1. Open http://localhost:3000 .

2. In the header ribbon choose **Load Demo**. This calls `POST /api/demo/seed`, which synthesises the “Supply of Bullet-Proof Vests to CRPF” scenario (six mandatory criteria, five bidders spanning clear pass, clear fail, and borderline dossiers), runs the Phase 8 evaluator, persists artefacts to SQLite, hydrates your session, and lands you on the adjudication lattice.

3. Inspect coloured lattice intersections, drill into evidence with the drawer, switch the lower tab to **Integrity anomalies**, and adjudicate anomalies with **Mark reviewed** (local bookkeeping).

Equivalent CLI seed (runs the same core routine and prints JSON to stdout):

```
cd backend
python seed_demo.py
```

### Local backend on Windows (no Docker)

Put your `.env` in the **`backend`** folder (same level as `app/`), or export `GEMINI_API_KEY` before starting — `pydantic-settings` loads `.env` from the current working directory.

**Do not** run plain `uvicorn ... --reload` from `backend/` without limiting the watch paths: the reloader otherwise watches `.venv`, and installs like PyTorch continuously touch thousands of files, which triggers reload loops and **Network Error** in the UI.

Prefer the bundled script (watches **only** `app/`):

```powershell
cd backend
.\dev_server.ps1
```

Equivalent one-liner:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
```

Stable mode (no reload, best while installing packages into `.venv`):

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
