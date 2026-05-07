from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.pdfgen import canvas

from .models import AnomalyReport, BidderEvaluation, CriterionSchema, EvidenceGraph


def generate_bidder_pdf(
    *,
    bidder_evaluation: BidderEvaluation,
    criteria: list[CriterionSchema],
    output_path: Path,
    run_id: str | None = None,
    generated_at: datetime | None = None,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "veridict_title",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=28,
        leading=30,
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "veridict_subtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=14,
        spaceAfter=10,
    )
    overall_style = ParagraphStyle(
        "veridict_overall",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "veridict_body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
    )

    criteria_map = {c.id: c for c in criteria}
    generated_dt = generated_at or datetime.now(timezone.utc)

    header = [
        "Criterion ID",
        "Description",
        "Decision",
        "Extracted Value",
        "Source Document",
        "Page Number",
        "Confidence Score",
    ]
    table_data: list[list[Paragraph | str]] = [header]
    hashed_rows: list[dict[str, str | None]] = []

    def _text(value: object | None) -> str:
        if value is None:
            return "N/A"
        as_text = str(value).strip()
        return as_text or "N/A"

    for row in bidder_evaluation.results:
        criterion = criteria_map.get(row.criterion_id)
        description = criterion.description if criterion else row.criterion_id
        extracted_value = _text(row.evidence.extracted_value)
        source_doc = _text(row.evidence.doc_name)
        page_number = str(row.evidence.page_number) if row.evidence.page_number is not None else "-"
        confidence = f"{row.confidence:.2f}"

        table_data.append(
            [
                Paragraph(_text(row.criterion_id), body_style),
                Paragraph(_text(description), body_style),
                Paragraph(_text(row.decision.value), body_style),
                Paragraph(_text(extracted_value), body_style),
                Paragraph(_text(source_doc), body_style),
                Paragraph(_text(page_number), body_style),
                Paragraph(_text(confidence), body_style),
            ]
        )
        hashed_rows.append(
            {
                "criterion_id": row.criterion_id,
                "description": description,
                "decision": row.decision.value,
                "extracted_value": extracted_value,
                "source_document": source_doc,
                "page_number": page_number,
                "confidence_score": confidence,
            }
        )

    hash_input = {
        "run_id": run_id or "",
        "bidder_id": bidder_evaluation.bidder_id,
        "overall_decision": bidder_evaluation.overall_decision.value,
        "overall_confidence": f"{bidder_evaluation.overall_confidence:.4f}",
        "generated_at": generated_dt.isoformat(),
        "rows": hashed_rows,
    }
    content_hash = hashlib.sha256(
        json.dumps(hash_input, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    story: list[object] = [
        Paragraph("VERIDICT", title_style),
        Paragraph("Procurement Evaluation Report", subtitle_style),
        Paragraph(f"Overall Decision: {bidder_evaluation.overall_decision.value}", overall_style),
        Paragraph(f"<b>Bidder ID:</b> {bidder_evaluation.bidder_id}", styles["Normal"]),
        Paragraph(f"<b>Run ID:</b> {run_id or 'N/A'}", styles["Normal"]),
        Paragraph(f"<b>Generated At:</b> {generated_dt.isoformat()}", styles["Normal"]),
        Spacer(1, 8),
    ]

    col_widths = [
        doc.width * 0.10,
        doc.width * 0.24,
        doc.width * 0.13,
        doc.width * 0.14,
        doc.width * 0.17,
        doc.width * 0.08,
        doc.width * 0.14,
    ]
    table = Table(table_data, repeatRows=1, colWidths=col_widths)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.black),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
            ]
        )
    )
    story.append(table)

    def _draw_footer(c: canvas.Canvas, d: SimpleDocTemplate) -> None:
        c.saveState()
        c.setFont("Helvetica", 7)
        c.drawString(d.leftMargin, 10 * mm, f"SHA-256: {content_hash}")
        c.drawString(d.leftMargin, 6 * mm, "Generated by Veridict - Tamper-evident audit trail")
        c.restoreState()

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
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
