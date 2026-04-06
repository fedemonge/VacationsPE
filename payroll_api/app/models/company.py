import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SCHEMA = "payroll"


class Company(Base):
    __tablename__ = "company"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ruc: Mapped[str] = mapped_column(String(11), unique=True, nullable=False)
    business_name: Mapped[str] = mapped_column(String(200), nullable=False)
    trade_name: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(500))
    country_code: Mapped[str] = mapped_column(String(2), default="PE")
    currency_code: Mapped[str] = mapped_column(String(3), default="PEN")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    # Relationships
    employees: Mapped[list["PayrollEmployee"]] = relationship(back_populates="company")  # noqa: F821
    cost_centers: Mapped[list["CostCenter"]] = relationship(back_populates="company")  # noqa: F821
    concepts: Mapped[list["PayrollConcept"]] = relationship(back_populates="company")  # noqa: F821
    periods: Mapped[list["PayrollPeriod"]] = relationship(back_populates="company")  # noqa: F821
