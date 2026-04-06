import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEMA = "payroll"


class Overtime(Base):
    __tablename__ = "overtime"
    __table_args__ = (
        UniqueConstraint("company_id", "employee_id", "overtime_date", name="uq_overtime"),
        Index("idx_overtime_date", "company_id", "overtime_date"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False)
    overtime_date: Mapped[date] = mapped_column(Date, nullable=False)
    hours_25: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    hours_35: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    hours_100: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[str | None] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(30), default="MANUAL")
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey(f"{SCHEMA}.import_batch.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)

    @property
    def total_hours(self) -> Decimal:
        return self.hours_25 + self.hours_35 + self.hours_100
