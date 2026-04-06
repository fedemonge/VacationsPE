import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SCHEMA = "payroll"


class PayrollPeriod(Base):
    __tablename__ = "payroll_period"
    __table_args__ = (
        UniqueConstraint("company_id", "period_year", "period_month", "period_type", name="uq_period"),
        Index("idx_period_status", "company_id", "status"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    period_type: Mapped[str] = mapped_column(String(20), default="MENSUAL")  # MENSUAL, GRATIFICACION, CTS, LIQUIDACION
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="ABIERTO")  # ABIERTO, EN_CALCULO, CALCULADO, CERRADO, ANULADO
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    calculated_by: Mapped[str | None] = mapped_column(String(200))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_by: Mapped[str | None] = mapped_column(String(200))
    rules_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    legal_params_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    @property
    def period_label(self) -> str:
        return f"{self.period_year:04d}-{self.period_month:02d}"

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="periods")  # noqa: F821
    details: Mapped[list["PayrollDetail"]] = relationship(back_populates="period")  # noqa: F821
    payment_files: Mapped[list["PaymentFile"]] = relationship(back_populates="period")  # noqa: F821
