import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEMA = "payroll"


class Commission(Base):
    __tablename__ = "commission"
    __table_args__ = (
        Index("idx_commission_period", "company_id", "period_year", "period_month"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    concept_code: Mapped[str] = mapped_column(String(20), default="COMISION")
    description: Mapped[str | None] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_remunerative: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(30), default="MANUAL")
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey(f"{SCHEMA}.import_batch.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
