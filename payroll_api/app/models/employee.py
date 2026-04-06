import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SCHEMA = "payroll"


class PayrollEmployee(Base):
    __tablename__ = "payroll_employee"
    __table_args__ = (
        Index("idx_payroll_employee_status", "company_id", "employment_status"),
        Index("idx_payroll_employee_external", "external_employee_id"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    employee_code: Mapped[str] = mapped_column(String(20), nullable=False)
    external_employee_id: Mapped[str | None] = mapped_column(String(100))

    # Personal data
    document_type: Mapped[str] = mapped_column(String(3), nullable=False)  # DNI, CE, PAS
    document_number: Mapped[str] = mapped_column(String(20), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    paternal_surname: Mapped[str] = mapped_column(String(100), nullable=False)
    maternal_surname: Mapped[str | None] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(300), nullable=False)  # Computed in app layer
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(20))
    birth_date: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(1))  # M, F
    address: Mapped[str | None] = mapped_column(String(500))

    # Banking
    bank_code: Mapped[str] = mapped_column(String(10), default="BBVA")
    bank_account_number: Mapped[str | None] = mapped_column(String(20))
    bank_cci: Mapped[str | None] = mapped_column(String(20))
    account_currency: Mapped[str] = mapped_column(String(3), default="PEN")

    # Employment
    employment_status: Mapped[str] = mapped_column(String(20), default="ACTIVO")
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)
    termination_date: Mapped[date | None] = mapped_column(Date)

    # Pension
    pension_system: Mapped[str] = mapped_column(String(10), nullable=False)  # AFP, ONP
    pension_provider: Mapped[str | None] = mapped_column(String(50))  # Habitat, Integra, Prima, Profuturo
    cuspp: Mapped[str | None] = mapped_column(String(20))

    # Flags
    has_5ta_cat_exemption: Mapped[bool] = mapped_column(Boolean, default=False)
    has_dependents: Mapped[bool] = mapped_column(Boolean, default=False)  # For asignacion familiar
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="employees")  # noqa: F821
    contracts: Mapped[list["EmploymentContract"]] = relationship(back_populates="employee")  # noqa: F821
    payroll_details: Mapped[list["PayrollDetail"]] = relationship(back_populates="employee")  # noqa: F821
