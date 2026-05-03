from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from .models import AnomalyReport, BidderEvaluation, CriterionSchema, EvidenceGraph


def generate_bidder_pdf(
    *,
    bidder_evaluation: BidderEvaluation,
    criteria: list[CriterionSchema],
    output_path: Path,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 20 * mm

    c.setFont("Helvetica-Bold", 13)
    c.drawString(20 * mm, y, f"Veridict Decision Sheet - {bidder_evaluation.bidder_id}")
    y -= 10 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, f"Overall Decision: {bidder_evaluation.overall_decision.value}")
    y -= 7 * mm
    c.drawString(20 * mm, y, f"Overall Confidence: {bidder_evaluation.overall_confidence:.2f}")
    y -= 12 * mm

    criteria_map = {c.id: c for c in criteria}
    for row in bidder_evaluation.results:
        if y < 25 * mm:
            c.showPage()
            y = height - 20 * mm
        desc = criteria_map.get(row.criterion_id).description if criteria_map.get(row.criterion_id) else row.criterion_id
        c.setFont("Helvetica-Bold", 10)
        c.drawString(20 * mm, y, f"{row.criterion_id}: {row.decision.value} ({row.confidence:.2f})")
        y -= 5 * mm
        c.setFont("Helvetica", 9)
        c.drawString(22 * mm, y, f"Reason: {row.reason[:120]}")
        y -= 5 * mm
        c.drawString(
            22 * mm,
            y,
            f"Evidence: {row.evidence.doc_name or 'N/A'} page {row.evidence.page_number or '-'}",
        )
        y -= 8 * mm

    c.save()
    output_path.write_bytes(buffer.getvalue())
    return output_path


def generate_matrix_excel(
    *,
    bidder_evaluations: list[BidderEvaluation],
    output_path: Path,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "Bidder Matrix"

    all_criteria = []
    seen = set()
    for b in bidder_evaluations:
        for r in b.results:
            if r.criterion_id not in seen:
                seen.add(r.criterion_id)
                all_criteria.append(r.criterion_id)

    headers = ["bidder_id"] + all_criteria + ["overall_decision", "overall_confidence", "flags_count"]
    ws.append(headers)

    for bidder in bidder_evaluations:
        row = [bidder.bidder_id]
        result_map = {r.criterion_id: r.decision.value for r in bidder.results}
        row.extend(result_map.get(c, "") for c in all_criteria)
        row.extend([bidder.overall_decision.value, bidder.overall_confidence, bidder.flags_count])
        ws.append(row)

    wb.save(output_path)
    return output_path


def export_evidence_graph(graph: EvidenceGraph, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(graph.model_dump_json(indent=2), encoding="utf-8")
    return output_path


def export_anomalies(anomalies: list[AnomalyReport], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps([a.model_dump() for a in anomalies], indent=2), encoding="utf-8")
    return output_path


def generate_phase8_pdf(sess) -> BytesIO:
    """Build a summary PDF for a phase-8 evaluation session (ReportLab)."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    _, height = A4
    y = height - 20 * mm

    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, y, f"Veridict Report — {sess.session_id}")
    y -= 10 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, f"Tender ID: {sess.tender_id} | File: {sess.tender_filename}")
    y -= 8 * mm
    c.drawString(20 * mm, y, f"Bidders uploaded: {len(sess.bidder_blocks)}")
    y -= 8 * mm
    if sess.criteria:
        c.drawString(20 * mm, y, f"Criteria: {len(sess.criteria)}")
        y -= 6 * mm

    for be in sess.bidder_evaluations:
        if y < 30 * mm:
            c.showPage()
            y = height - 20 * mm
        c.setFont("Helvetica-Bold", 11)
        c.drawString(20 * mm, y, f"Bidder {be.bidder_id}")
        y -= 6 * mm
        c.setFont("Helvetica", 9)
        c.drawString(
            22 * mm,
            y,
            f"Overall: {be.overall_decision.value} (confidence {be.overall_confidence:.2f}, flags {be.flags_count})",
        )
        y -= 5 * mm

    if sess.anomaly_flags:
        y -= 4 * mm
        c.setFont("Helvetica-Bold", 10)
        c.drawString(20 * mm, y, "Anomalies")
        y -= 5 * mm
        for flag in sess.anomaly_flags[:30]:
            if y < 25 * mm:
                c.showPage()
                y = height - 20 * mm
            c.setFont("Helvetica", 8)
            line = f"{flag.anomaly_type} ({flag.severity}): {flag.description[:120]}"
            c.drawString(22 * mm, y, line)
            y -= 4 * mm

    c.save()
    buffer.seek(0)
    return buffer
