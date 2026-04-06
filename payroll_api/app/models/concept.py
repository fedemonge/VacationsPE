import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SCHEMA = "payroll"


class PayrollConcept(Base):
    __tablename__ = "payroll_concept"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_concept_code"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)  # INGRESO, DESCUENTO, APORTE_EMPLEADOR, INFORMATIVO
    subcategory: Mapped[str | None] = mapped_column(String(50))  # REMUNERATIVO, NO_REMUNERATIVO, OBLIGATORIO, VOLUNTARIO

    # Legal affectations
    affects_essalud: Mapped[bool] = mapped_column(Boolean, default=False)
    affects_pension: Mapped[bool] = mapped_column(Boolean, default=False)
    affects_5ta_cat: Mapped[bool] = mapped_column(Boolean, default=False)
    affects_gratification: Mapped[bool] = mapped_column(Boolean, default=False)
    affects_cts: Mapped[bool] = mapped_column(Boolean, default=False)
    affects_vacation_pay: Mapped[bool] = mapped_column(Boolean, default=False)

    # Config
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="concepts")  # noqa: F821
    rules: Mapped[list["ConceptRule"]] = relationship(back_populates="concept")


class ConceptRule(Base):
    __tablename__ = "concept_rule"
    __table_args__ = (
        Index("idx_concept_rule_validity", "concept_id", "valid_from", "valid_to"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_concept.id"), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)
    calc_type: Mapped[str] = mapped_column(String(20), nullable=False)  # FIXED, PERCENTAGE, FORMULA, LOOKUP, EXTERNAL
    calc_base: Mapped[str | None] = mapped_column(String(100))  # e.g., base_salary, total_remunerativo
    calc_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    calc_formula: Mapped[str | None] = mapped_column(Text)
    parameters: Mapped[dict] = mapped_column(JSONB, default=dict)
    description: Mapped[str | None] = mapped_column(Text)
    legal_reference: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    # Relationships
    concept: Mapped["PayrollConcept"] = relationship(back_populates="rules")
