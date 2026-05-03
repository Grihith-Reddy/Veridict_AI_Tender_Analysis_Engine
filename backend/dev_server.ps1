# Run from this directory:  cd backend; .\dev_server.ps1
# Only watches .\app — avoids reload storms when pip/torch touches .venv
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
& "$PSScriptRoot\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
