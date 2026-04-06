import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SCHEMA = "payroll"


class EmploymentContract(Base):
    __tablename__ = "employment_contract"
    __table_args__ = (
        Index("idx_contract_employee", "employee_id", "is_current"),
        Index("idx_contract_dates", "start_date", "end_date"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False)
    contract_type: Mapped[str] = mapped_column(String(30), nullable=False)  # INDEFINIDO, PLAZO_FIJO, PARCIAL, FORMATIVO
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    base_salary: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cost_center_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.cost_center.id"), nullable=False)
    position_title: Mapped[str | None] = mapped_column(String(200))
    work_schedule: Mapped[str] = mapped_column(String(20), default="48H")  # 48H, 36H, 24H, PARCIAL
    daily_hours: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=Decimal("8.0"))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    # Computed rates (app layer)
    @property
    def daily_rate(self) -> Decimal:
        return self.base_salary / Decimal("30")

    @property
    def hourly_rate(self) -> Decimal:
        return self.base_salary / Decimal("240")

    # Relationships
    employee: Mapped["PayrollEmployee"] = relationship(back_populates="contracts")  # noqa: F821
    cost_center: Mapped["CostCenter"] = relationship(back_populates="contracts")  # noqa: F821
