from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .config import settings


class RunRepository:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or settings.storage_dir / "db" / "veridict.sqlite"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS officer_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    criterion_id TEXT NOT NULL,
                    bidder_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def save_run(self, *, run_id: str, created_at: str, payload: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO runs (run_id, created_at, payload_json)
                VALUES (?, ?, ?)
                """,
                (run_id, created_at, json.dumps(payload)),
            )
            conn.commit()

    def get_run_payload(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT payload_json FROM runs WHERE run_id = ?", (run_id,)).fetchone()
            if not row:
                return None
            return json.loads(row["payload_json"])

    def save_officer_action(
        self,
        *,
        run_id: str,
        criterion_id: str,
        bidder_id: str,
        action: str,
        actor: str,
        created_at: str,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO officer_actions (run_id, criterion_id, bidder_id, action, actor, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (run_id, criterion_id, bidder_id, action, actor, created_at),
            )
            conn.commit()
