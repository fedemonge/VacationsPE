import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SCHEMA = "payroll"


class PayrollDetail(Base):
    __tablename__ = "payroll_detail"
    __table_args__ = (
        UniqueConstraint("period_id", "employee_id", name="uq_detail_period_employee"),
        Index("idx_detail_period", "period_id"),
        Index("idx_detail_employee", "employee_id"),
        Index("idx_detail_cost_center", "cost_center_id"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False)
    contract_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.employment_contract.id"), nullable=False)
    cost_center_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.cost_center.id"), nullable=False)

    base_salary: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    days_worked: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("30"))

    total_ingresos: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_descuentos: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_aportes_empleador: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    neto_a_pagar: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))

    # Banking snapshot for BBVA file
    bank_account_snapshot: Mapped[str | None] = mapped_column(String(20))
    bank_cci_snapshot: Mapped[str | None] = mapped_column(String(20))

    status: Mapped[str] = mapped_column(String(20), default="CALCULADO")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    # Relationships
    period: Mapped["PayrollPeriod"] = relationship(back_populates="details")  # noqa: F821
    employee: Mapped["PayrollEmployee"] = relationship(back_populates="payroll_details")  # noqa: F821
    lines: Mapped[list["PayrollDetailLine"]] = relationship(back_populates="detail", cascade="all, delete-orphan")


class PayrollDetailLine(Base):
    __tablename__ = "payroll_detail_line"
    __table_args__ = (
        Index("idx_detail_line_detail", "detail_id"),
        Index("idx_detail_line_concept", "concept_code"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    detail_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_detail.id"), nullable=False)
    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_concept.id"), nullable=False)
    concept_code: Mapped[str] = mapped_column(String(20), nullable=False)
    concept_name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)

    calc_base_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    calc_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    calc_formula_used: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    rule_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey(f"{SCHEMA}.concept_rule.id"))
    rule_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)

    # Relationships
    detail: Mapped["PayrollDetail"] = relationship(back_populates="lines")
