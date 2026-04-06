import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEMA = "payroll"


class Payslip(Base):
    __tablename__ = "payslip"
    __table_args__ = (
        UniqueConstraint("period_id", "employee_id", name="uq_payslip"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False)
    detail_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_detail.id"), nullable=False)
    pdf_s3_key: Mapped[str | None] = mapped_column(String(500))
    pdf_hash: Mapped[str | None] = mapped_column(String(64))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_to_email: Mapped[str | None] = mapped_column(String(200))
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
