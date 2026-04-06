import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEMA = "payroll"


class LegalParameter(Base):
    __tablename__ = "legal_parameter"
    __table_args__ = (
        UniqueConstraint("company_id", "country_code", "param_key", "valid_from", name="uq_legal_param"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), default="PE")
    param_key: Mapped[str] = mapped_column(String(50), nullable=False)
    param_value: Mapped[Decimal] = mapped_column(Numeric(15, 6), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(String(200))
    legal_reference: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
