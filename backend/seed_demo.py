#!/usr/bin/env python3
"""CLI entry: populate SQLite + in-memory orchestration artefacts for demo tender (same payload as POST /api/demo/seed).

Run from the backend directory:
  cd backend && python seed_demo.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_BASE = Path(__file__).resolve().parent
if str(_BASE) not in sys.path:
    sys.path.insert(0, str(_BASE))


def main() -> None:
    from app.demo_seed import run_demo_bundle

    bundle = run_demo_bundle()
    print(json.dumps(bundle, indent=2, default=str))


if __name__ == "__main__":
    main()
