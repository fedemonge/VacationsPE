from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, field_validator


class EmployeeCreate(BaseModel):
    employee_code: str
    document_type: str  # DNI, CE, PAS
    document_number: str
    first_name: str
    paternal_surname: str
    maternal_surname: str | None = None
    email: str | None = None
    phone: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    address: str | None = None
    bank_code: str = "BBVA"
    bank_account_number: str | None = None
    bank_cci: str | None = None
    account_currency: str = "PEN"
    hire_date: date
    pension_system: str  # AFP, ONP
    pension_provider: str | None = None
    cuspp: str | None = None
    has_5ta_cat_exemption: bool = False
    has_dependents: bool = False
    external_employee_id: str | None = None

    @field_validator("document_type")
    @classmethod
    def validate_doc_type(cls, v: str) -> str:
        if v not in ("DNI", "CE", "PAS"):
            raise ValueError("document_type debe ser DNI, CE o PAS")
        return v

    @field_validator("pension_system")
    @classmethod
    def validate_pension(cls, v: str) -> str:
        if v not in ("AFP", "ONP"):
            raise ValueError("pension_system debe ser AFP u ONP")
        return v


class EmployeeUpdate(BaseModel):
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    bank_code: str | None = None
    bank_account_number: str | None = None
    bank_cci: str | None = None
    account_currency: str | None = None
    pension_system: str | None = None
    pension_provider: str | None = None
    cuspp: str | None = None
    has_5ta_cat_exemption: bool | None = None
    has_dependents: bool | None = None
    employment_status: str | None = None
    termination_date: date | None = None


class EmployeeResponse(BaseModel):
    id: UUID
    company_id: UUID
    employee_code: str
    external_employee_id: str | None
    document_type: str
    document_number: str
    first_name: str
    paternal_surname: str
    maternal_surname: str | None
    full_name: str
    email: str | None
    phone: str | None
    birth_date: date | None
    gender: str | None
    bank_code: str
    bank_account_number: str | None
    bank_cci: str | None
    employment_status: str
    hire_date: date
    termination_date: date | None
    pension_system: str
    pension_provider: str | None
    cuspp: str | None
    has_5ta_cat_exemption: bool
    has_dependents: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Current contract info (populated in API layer)
    current_salary: Decimal | None = None
    current_cost_center: str | None = None
    current_position: str | None = None

    model_config = {"from_attributes": True}
