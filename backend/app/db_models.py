# C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\backend\app\db_models.py
"""SQLAlchemy ORM models for prototype persistence (separate from RunRepository JSON store)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .config import settings


class Base(DeclarativeBase):
    pass


class Tender(Base):
    __tablename__ = "tenders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(512), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    bidders: Mapped[list["Bidder"]] = relationship(back_populates="tender", cascade="all, delete-orphan")
    criteria: Mapped[list["CriterionSchema"]] = relationship(back_populates="tender", cascade="all, delete-orphan")


class Bidder(Base):
    __tablename__ = "bidders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tender_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenders.id", ondelete="CASCADE"))
    display_name: Mapped[str] = mapped_column(String(512), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    tender: Mapped["Tender"] = relationship(back_populates="bidders")


class CriterionSchema(Base):
    __tablename__ = "criterion_schemas"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    tender_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenders.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(64), default="semantic_match")
    field: Mapped[str | None] = mapped_column(String(256), nullable=True)
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(32), nullable=True)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    legal_keywords_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_sources_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    ambiguous: Mapped[bool] = mapped_column(Boolean, default=False)

    tender: Mapped["Tender"] = relationship(back_populates="criteria")


class VerdictDecision(Base):
    __tablename__ = "verdict_decisions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    criterion_id: Mapped[str] = mapped_column(String(128))
    bidder_id: Mapped[str] = mapped_column(String(64))
    decision: Mapped[str] = mapped_column(String(32))
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    reasoning: Mapped[str] = mapped_column(Text, default="")
    evidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class AnomalyFlag(Base):
    __tablename__ = "anomaly_flags"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    criterion_id: Mapped[str] = mapped_column(String(128))
    bidder_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    anomaly_type: Mapped[str] = mapped_column(String(64), default="unknown")
    description: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(32), default="medium")


_ORM_ENGINE = None


def get_orm_engine():
    global _ORM_ENGINE
    path = settings.storage_dir / "db" / "veridict_orm.sqlite"
    path.parent.mkdir(parents=True, exist_ok=True)
    if _ORM_ENGINE is None:
        _ORM_ENGINE = create_engine(f"sqlite:///{path.as_posix()}", echo=False)

        @event.listens_for(_ORM_ENGINE, "connect")
        def _sqlite_foreign_keys(dbapi_connection: object, _: object) -> None:
            cur = dbapi_connection.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return _ORM_ENGINE


def init_orm_db() -> None:
    engine = get_orm_engine()
    Base.metadata.create_all(bind=engine)
