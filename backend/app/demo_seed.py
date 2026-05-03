# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\demo_seed.py
"""Synthetic CRPF bullet-proof vest procurement demo: criteria, dossiers, Phase-8 evaluation, SQLite ORM persistence."""
from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from .engines import AuditTrail
from .engines.consistency import AnomalyFlag as ConsistencyAnomaly
from .engines.verdict_core import VerdictDecision
from .db_models import AnomalyFlag as OrmAnomaly
from .db_models import Bidder as OrmBidder
from .db_models import CriterionSchema as OrmCriterion
from .db_models import Tender as OrmTender
from .db_models import VerdictDecision as OrmVerdict
from .db_models import get_orm_engine, init_orm_db
from .models import CriterionSchema, CriterionType, TextBlock
from .services.evaluation_session import EvaluationSession, store
from .services.phase8_pipeline import run_phase8_evaluation

DEMO_TENDER_TITLE = (
    "Tender DEMO-CRPF-Vests: Supply of Ballistic Vests under Quality Assurance Framework to CRPF formations"
)

# Stable ORM tender id after session mutation (see run_demo_bundle).
DEMO_TENDER_PRIMARY_KEY = "DEMO-TDR-CRPF-VESTS"


def demo_criteria() -> list[CriterionSchema]:
    """Six mandatory criteria aligned with evaluator types (numeric vs semantic_match for boolean-ish checks)."""
    return [
        CriterionSchema(
            id="C-01",
            description="Annual average turnover ≥ ₹50 crore consolidated over the immediately preceding three financial years.",
            type=CriterionType.numeric_threshold,
            field="average_annual_turnover",
            threshold=500_000_000.0,  # 50 crore in INR scalar used by extractor
            currency="INR",
            mandatory=True,
            legal_keywords_found=["annual", "turnover", "financial years"],
            evidence_sources=["Audited turnover statement", "CA certificate"],
            ambiguous=False,
        ),
        CriterionSchema(
            id="C-02",
            description="Bidder possesses minimum five (5) years demonstrable experience in defence or central armed police forces security equipment supply.",
            type=CriterionType.semantic_match,
            field="work_experience",
            years_required=5,
            mandatory=True,
            legal_keywords_found=["experience", "defence"],
            evidence_sources=["Work completion certificates", "Purchase orders"],
            ambiguous=False,
        ),
        CriterionSchema(
            id="C-03",
            description="Possession of valid ISO 9001:2015 quality management certification covering relevant scope at time of bid.",
            type=CriterionType.semantic_match,
            field=None,
            mandatory=True,
            legal_keywords_found=["ISO", "certification"],
            evidence_sources=["ISO certificate"],
            ambiguous=False,
        ),
        CriterionSchema(
            id="C-04",
            description="Net worth not less than ₹10 crore duly certified.",
            type=CriterionType.numeric_threshold,
            field="net_worth",
            threshold=100_000_000.0,
            currency="INR",
            mandatory=True,
            legal_keywords_found=["net worth"],
            evidence_sources=["Chartered Accountant certificate"],
            ambiguous=False,
        ),
        CriterionSchema(
            id="C-05",
            description="Valid GST registration in force for lawful supply of ballistic protection equipment classification.",
            type=CriterionType.semantic_match,
            field=None,
            mandatory=True,
            legal_keywords_found=["GST", "registration"],
            evidence_sources=["GST certificate"],
            ambiguous=False,
        ),
        CriterionSchema(
            id="C-06",
            description="Neither the bidder nor any director convicted or blacklisted/debarred in last five financial years.",
            type=CriterionType.semantic_match,
            field=None,
            mandatory=True,
            legal_keywords_found=["blacklist", "conviction"],
            evidence_sources=["Integrity declaration"],
            ambiguous=False,
        ),
    ]


def _tb(doc: str, page: int, idx: int, text: str) -> TextBlock:
    return TextBlock(
        id=f"tb-{uuid.uuid4().hex[:10]}",
        doc_name=doc,
        page_number=page,
        block_index=idx,
        text=text,
        ocr_confidence=0.99,
        extraction_method="direct_parse",
    )


def tender_demo_blocks() -> list[TextBlock]:
    raw = """GOVERNMENT OF INDIA
MINISTRY OF HOME AFFAIRS
CENTRAL RESERVE POLICE FORCE — SUPPLY OF BULLET-PROOF VESTS

The CRPF intends expedited consolidated procurement for NIJ-aligned ballistic ensembles and technical assurance testing.

Eligibility frameworks demand sealed technical and commercial bids affirming audited financial pedigree, longitudinal defence-sector performance, conformity of certified quality systems,
demonstrably solvent consolidated net-worth, lawful indirect tax registration footing, plus binding integrity affidavits regarding criminal disqualification and centrally administered blacklist lists.

Mandatory evaluation criteria excerpts (deterministic adjudication lineage)
• C-01 Average annual audited consolidated turnover for the three immediately preceding financial years SHALL be ₹50 crore or GREATER arithmetic mean computation.
• C-02 Demonstrable cumulative FIVE YEARS uninterrupted experience furnishing defence ministries, CAPFs or integral security formations with ballistic or tactical protection materiel compulsory.
• C-03 ACTIVE ISO9001:2015 certification aligning manufacturing/integration scope obligatory; lapse voids conformance.
• C-04 Chartered Accountant certificate affirming ₹10 crore or higher positive net-worth without qualified adverse narratives mandatory.
• C-05 Valid GST registration consonant statutory classification for supplied articles obligatory; surrendered registration constitutes automatic failure.
• C-06 Bidder MUST attest neither firm nor promoters suffering criminal convictions or administrative BLACKLIST/DEBARMENT within five reference years.

Interpretation discipline
Mandatory lexicon invokes shall / MUST / compulsory exclusively — discretionary relief excluded absent superior written exemption (none issued).
"""
    return [_tb("TDR-DEMO-TENDER.docx", 1, 0, raw.strip())]


def bidder_dossiers() -> dict[str, list[TextBlock]]:
    """Five bidders — 2 strong eligible, 1 failed, 2 borderline / review-prone narratives."""
    b: dict[str, list[TextBlock]] = {}

    b["BharatArmor_Limited"] = [
        _tb("BharatArmor_Limited-financial.docx", 1, 0, ""),
    ]
    b["BharatArmor_Limited"][0].text = (
        "FINANCIAL ANNEX — Bharat Armor Limited GSTIN 24AABCB1234C1ZC. "
        "Audited consolidated average annual turnover for FY22-21, FY23-22 and FY24-25 equals ₹118 crore aggregated revenue base. "
        "Chartered Accountant certifies tangible net-worth ₹218 crore excluding contingent litigation not material. "
        "GST registration ACTIVE since 2017 classified under Chapter 9305 protective equipment chapter."
    )
    b["BharatArmor_Limited"].append(
        _tb("BharatArmor_Limited-technical.docx", 2, 0, ""),
    )
    b["BharatArmor_Limited"][-1].text = (
        "TECHNICAL PEDIGREE — We have eleven continuous years furnishing Ministry of Defence and CRPF ballistic panels shipments including serial contract CRPF/RFP/BV/2016-084. "
        "ISO 9001:2015 certificate number IN–44122 valid through 2027 covering design-to-delivery ballistic integration. "
        "Integrity affidavit: authorised signatories certify ZERO convictions and NO blacklisting notices on GEM / MoD / Railways central lists for five years preceding submission."
    )

    b["SecureVest_Industries"] = [
        _tb("SecureVest-audit-pack.pdf", 1, 0, ""),
    ]
    b["SecureVest_Industries"][0].text = (
        "SecureVest Industries Pvt Ltd — GST registration 06AAACS1122R1ZD confirmed operational. "
        "Average audited turnover FY21–FY24 ₹96 crore consolidating domestic defence tenders. CA firm certifies ₹145 crore audited net-worth. "
        "Work experience dossier cites eight years sustained CRPF LC contract execution with signed completion certificates numbering 014 through 089. "
        "ISO9001:2015 scope certificate attached with Indian accreditation board logo (valid)."
    )
    b["SecureVest_Industries"].append(
        _tb("SecureVest-compliance.pdf", 2, 0, ""),
    )
    b["SecureVest_Industries"][-1].text = (
        "DECLARATIONS — Bidder complies with statutory obligations; directors affirm ZERO criminal convictions, NO blacklisting adjudications ACTIVE; "
        "procurement portals show ELIGIBLE status for central armed police tenders."
    )

    b["RogueTraders_Pvt"] = [
        _tb("Rogue-financial-summary.docx", 1, 0, ""),
    ]
    b["RogueTraders_Pvt"][0].text = (
        "Rogue Traders Pvt Ltd states aggregate turnover ₹130 crore referencing unaudited management figures (projected). Chartered Accountant caveat references pending restatements. "
        "Estimated net-worth narrative indicates ₹115 crore goodwill heavy without harmonised audited schedule — figures disputed internally."
    )
    b["RogueTraders_Pvt"].append(
        _tb("Rogue-experience-decl.docx", 2, 0, ""),
    )
    b["RogueTraders_Pvt"][-1].text = (
        "EXPERIENCE — Commercial apparel export since incorporation 2019 overlapping two low-value municipal uniform orders only; NOT defence specialised but claims transferable skills. "
        "NO ISO9001 manufacturing certificate presently — management expresses intent only. GST registration surrendered temporarily during FY24 dispute resolution reopened mid fiscal."
    )
    b["RogueTraders_Pvt"].append(
        _tb("Rogue-integrity-affidavit.docx", 3, 0, ""),
    )
    b["RogueTraders_Pvt"][-1].text = (
        "AFFIDAVIT — Directors disclose civil penalty settlement 2023; GEM portal flagged firm under REVIEW_BLACKLIST_NOTICE_KA2021 referencing arms-length procurement prohibition until 2030 cycle."
        " CENTRAL_REGISTRY shows BLACKLISTED status for ballistic category supply until revocation."
    )

    b["MarginLine_Global"] = [
        _tb("MarginLine-financial-scan.pdf", 1, 0, ""),
    ]
    margin_turnover = (
        "MarginLine Global Logistics average turnover heuristic approximates ₹47 to ₹52 crore band depending carve-out schedules; audited mean reported ₹49.25 crore ambiguous footnote exclusions. "
        "Chartered Accountant appendix flags ongoing segment restatement; confidence interval narrative NOT finalised statutory filing. "
        "Tentative indicative net-worth narrative ₹94 crore subject to refinancing clause. "
        "GSTIN ACTIVE 07AAACM5566Z1ZD."
    )
    b["MarginLine_Global"][0].text = margin_turnover

    b["MarginLine_Global"].append(
        _tb("MarginLine-technical.pdf", 2, 0, ""),
    )
    b["MarginLine_Global"][-1].text = (
        "Experience dossier cites five years MIXED civilian logistics PLUS two defence adjacent pilot trials not fully executed deliveries; scope interpretation PARTIAL ambiguous. "
        "ISO certification PDF supplied appears draft watermark NOT final registrar embossment — QC review recommended. Integrity statement generically denies convictions but cites director civil litigation NOT concluded."
    )

    b["DeltaShield_Logistics"] = [
        _tb("Delta-financial-suite.pdf", 1, 0, ""),
    ]
    b["DeltaShield_Logistics"][0].text = (
        "DeltaShield Logistics GSTIN active. Consolidated audited average turnover ₹88 crore FY22–FY25. Chartered Accountant certifies net-worth ₹167 crore consolidated group basis including associate SPV exclusions footnoted Schedule 14B."
    )
    b["DeltaShield_Logistics"].append(
        _tb("Delta-ops-profile.pdf", 2, 0, ""),
    )
    b["DeltaShield_Logistics"][-1].text = (
        "Defence ballistic panel integration track record spanning six completed MOD indent orders with conformity acceptance notes 2018–present. ISO9001:2015 accreditation current. "
        "Integrity clause: NO final criminal conviction recorded; nevertheless director subject to ongoing Directorate of Vigilance civil inquiry flagged NOT closed — procurement officer manual adjudication warranted because risk registers show PENDING escalation."
        " Semantic signals otherwise indicate eligible compliance wording interleaved with contradictory uncertainty."
    )

    return b


def _serialize_criteria(criteria: list[CriterionSchema]) -> list[dict[str, Any]]:
    return [c.model_dump(mode="json") for c in criteria]


def _serialize_decisions(decisions: dict[str, list[VerdictDecision]]) -> dict[str, list[dict[str, Any]]]:
    return {bid: [vd.model_dump(mode="json") for vd in lst] for bid, lst in decisions.items()}


def _serialize_anomalies(flags: list[ConsistencyAnomaly]) -> list[dict[str, Any]]:
    return [f.model_dump(mode="json") for f in flags]


def persist_demo_sqlite(sess: EvaluationSession, decisions: dict[str, list[VerdictDecision]], flags: list[ConsistencyAnomaly]) -> None:
    init_orm_db()
    engine = get_orm_engine()
    SessionLocal = sessionmaker(bind=engine)
    criteria = sess.criteria or []

    with SessionLocal.begin() as db:
        assert isinstance(db, Session)
        old = db.get(OrmTender, DEMO_TENDER_PRIMARY_KEY)
        if old is not None:
            db.delete(old)

        db.add(
            OrmTender(
                id=DEMO_TENDER_PRIMARY_KEY,
                title=DEMO_TENDER_TITLE,
            )
        )

        bidder_names = {
            "BharatArmor_Limited": "Bharat Armor Limited",
            "SecureVest_Industries": "SecureVest Industries Pvt Ltd",
            "RogueTraders_Pvt": "Rogue Traders Pvt Ltd",
            "MarginLine_Global": "MarginLine Global Logistics",
            "DeltaShield_Logistics": "DeltaShield Logistics",
        }
        for bid in sess.bidder_blocks.keys():
            db.add(
                OrmBidder(
                    id=bid,
                    tender_id=DEMO_TENDER_PRIMARY_KEY,
                    display_name=bidder_names.get(bid, bid.replace("_", " ")),
                )
            )

        for c in criteria:
            db.add(
                OrmCriterion(
                    id=c.id,
                    tender_id=DEMO_TENDER_PRIMARY_KEY,
                    description=c.description,
                    type=c.type.value,
                    field=c.field,
                    threshold=c.threshold,
                    currency=c.currency,
                    mandatory=c.mandatory,
                    legal_keywords_json=json.dumps(c.legal_keywords_found),
                    evidence_sources_json=json.dumps(c.evidence_sources),
                    ambiguous=c.ambiguous,
                )
            )

        run_id = sess.session_id

        db.query(OrmVerdict).filter(OrmVerdict.run_id == run_id).delete(synchronize_session=False)
        db.query(OrmAnomaly).filter(OrmAnomaly.run_id == run_id).delete(synchronize_session=False)

        for plist in decisions.values():
            for vd in plist:
                db.add(
                    OrmVerdict(
                        run_id=run_id,
                        criterion_id=vd.criterion_id,
                        bidder_id=vd.bidder_id,
                        decision=str(vd.decision.value),
                        confidence=vd.confidence,
                        reasoning=vd.reasoning,
                        evidence_json=json.dumps(vd.evidence.model_dump(mode="json")),
                    )
                )

        for af in flags:
            db.add(
                OrmAnomaly(
                    run_id=run_id,
                    criterion_id=af.criterion_id,
                    bidder_ids_json=json.dumps(af.bidder_ids),
                    anomaly_type=af.anomaly_type,
                    description=af.description,
                    severity=af.severity,
                )
            )


def run_demo_bundle() -> dict[str, Any]:
    criteria = demo_criteria()
    tender_blocks = tender_demo_blocks()
    sess = store.create(tender_blocks=tender_blocks, tender_filename="DEMO_CRPF_VEST_RFP.docx")
    sess.tender_id = DEMO_TENDER_PRIMARY_KEY

    for bidder_id, blocks in sorted(bidder_dossiers().items()):
        store.add_bidder_blocks(sess.session_id, bidder_id, blocks)

    sess.criteria = criteria
    audit = AuditTrail()
    decisions, flags = run_phase8_evaluation(sess, audit)

    persist_demo_sqlite(sess, decisions, flags)

    bidder_ids_ordered = sorted(sess.bidder_blocks.keys())
    tender_pages = (
        len({tb.page_number for tb in sess.tender_blocks}) if sess.tender_blocks else 1
    )

    return {
        "session_id": sess.session_id,
        "tender_id": sess.tender_id,
        "tender_title": DEMO_TENDER_TITLE,
        "tender_block_count": len(sess.tender_blocks),
        "tender_pages": tender_pages,
        "criteria": _serialize_criteria(criteria),
        "decisions": _serialize_decisions(decisions),
        "anomalies": _serialize_anomalies(flags),
        "bidder_ids_ordered": bidder_ids_ordered,
        "ambiguous_initially": sum(1 for x in criteria if x.ambiguous),
    }
