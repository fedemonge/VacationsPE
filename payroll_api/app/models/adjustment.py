import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEMA = "payroll"


class PayrollAdjustment(Base):
    __tablename__ = "payroll_adjustment"
    __table_args__ = (
        Index("idx_adjustment_period", "period_id"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False)
    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_concept.id"), nullable=False)
    adjustment_type: Mapped[str] = mapped_column(String(20), nullable=False)  # CORRECCION, REINTEGRO, DESCUENTO_POSTERIOR
    original_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    adjusted_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    adjusted_by: Mapped[str] = mapped_column(String(200), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(200))
    applied_in_period_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_period.id"))
    status: Mapped[str] = mapped_column(String(20), default="PENDIENTE")  # PENDIENTE, APROBADO, APLICADO, RECHAZADO
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    @property
    def difference(self) -> Decimal:
        return self.adjusted_amount - (self.original_amount or Decimal("0"))
