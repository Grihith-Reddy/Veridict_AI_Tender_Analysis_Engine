# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\engines\audit.py
from __future__ import annotations

import hashlib
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..models import AuditEntry


def _audit_root() -> Path:
    if Path("/tmp").exists():
        return Path("/tmp/veridict_audit")
    return Path(tempfile.gettempdir()) / "veridict_audit"


def audit_log_path_for_session(session_id: str) -> Path:
    return _audit_root() / f"audit_{session_id}.jsonl"


def _sha256_hex(data: str | bytes) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def _canonical_json(obj: dict[str, Any]) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


def log_step(
    session_id: str,
    step: str,
    criterion_id: str,
    bidder_id: str,
    input_data: dict[str, Any],
    output_data: dict[str, Any],
    model_used: str,
) -> AuditEntry:
    path = audit_log_path_for_session(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)

    prev_line_raw: str | None = None
    if path.exists() and path.stat().st_size > 0:
        lines = path.read_text(encoding="utf-8").splitlines()
        if lines:
            prev_line_raw = lines[-1]

    previous_link = "GENESIS" if prev_line_raw is None else _sha256_hex(prev_line_raw)

    ts = datetime.now(timezone.utc)
    input_hash = _sha256_hex(_canonical_json(input_data))

    body: dict[str, Any] = {
        "step": step,
        "criterion_id": criterion_id or None,
        "bidder_id": bidder_id or None,
        "input_hash": input_hash,
        "previous_hash": previous_link,
        "output": output_data,
        "timestamp": ts.isoformat(),
        "model_used": model_used,
    }

    canonical = _canonical_json(body)
    entry_hash = _sha256_hex(previous_link + canonical)
    body["entry_hash"] = entry_hash

    line_out = _canonical_json(body)
    with path.open("a", encoding="utf-8") as f:
        f.write(line_out + "\n")

    return AuditEntry(
        step=step,
        criterion_id=body.get("criterion_id"),
        bidder_id=body.get("bidder_id"),
        input_hash=input_hash,
        previous_hash=previous_link,
        entry_hash=entry_hash,
        output=output_data,
        timestamp=ts,
        model_used=model_used,
    )


def verify_chain(session_id: str) -> bool:
    path = audit_log_path_for_session(session_id)
    if not path.exists() or path.stat().st_size == 0:
        return True

    lines = path.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            return False

        expected_prev = "GENESIS" if i == 0 else _sha256_hex(lines[i - 1])
        if obj.get("previous_hash") != expected_prev:
            return False

        entry_hash = obj.get("entry_hash")
        if not entry_hash:
            return False

        body = {k: v for k, v in obj.items() if k != "entry_hash"}
        canonical = _canonical_json(body)
        if _sha256_hex(str(obj.get("previous_hash")) + canonical) != entry_hash:
            return False

    return True


def export_audit(session_id: str) -> list[AuditEntry]:
    path = audit_log_path_for_session(session_id)
    if not path.exists():
        return []

    entries: list[AuditEntry] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        if isinstance(d.get("timestamp"), str):
            d["timestamp"] = datetime.fromisoformat(d["timestamp"].replace("Z", "+00:00"))
        entries.append(AuditEntry.model_validate(d))
    return entries


class AuditTrail:
    """Per-request audit session; call :meth:`begin_session` before :meth:`write`."""

    def __init__(self) -> None:
        self._session_id: str | None = None

    def begin_session(self, session_id: str) -> None:
        self._session_id = session_id

    def write(
        self,
        *,
        step: str,
        output: dict[str, Any],
        model_used: str,
        criterion_id: str | None = None,
        bidder_id: str | None = None,
        input_obj: dict[str, Any] | None = None,
    ) -> AuditEntry:
        if not self._session_id:
            raise RuntimeError("AuditTrail.begin_session(session_id) must be called before write().")
        return log_step(
            self._session_id,
            step,
            criterion_id or "",
            bidder_id or "",
            input_obj or {},
            output,
            model_used,
        )
