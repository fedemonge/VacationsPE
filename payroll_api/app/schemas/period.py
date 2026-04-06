from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class PeriodCreate(BaseModel):
    period_year: int
    period_month: int
    period_type: str = "MENSUAL"
    start_date: date
    end_date: date
    payment_date: date | None = None
    notes: str | None = None


class PeriodResponse(BaseModel):
    id: UUID
    company_id: UUID
    period_year: int
    period_month: int
    period_label: str
    period_type: str
    start_date: date
    end_date: date
    payment_date: date | None
    status: str
    calculated_at: datetime | None
    calculated_by: str | None
    closed_at: datetime | None
    closed_by: str | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PeriodSummary(BaseModel):
    period_id: UUID
    period_label: str
    status: str
    headcount: int
    total_ingresos: Decimal
    total_descuentos: Decimal
    total_aportes_empleador: Decimal
    total_neto: Decimal


class EmployeePayrollDetail(BaseModel):
    employee_id: UUID
    employee_code: str
    full_name: str
    cost_center: str
    base_salary: Decimal
    days_worked: Decimal
    total_ingresos: Decimal
    total_descuentos: Decimal
    total_aportes_empleador: Decimal
    neto_a_pagar: Decimal
    lines: list["PayrollLineDetail"]


class PayrollLineDetail(BaseModel):
    concept_code: str
    concept_name: str
    category: str
    amount: Decimal
    calc_base_amount: Decimal | None = None
    calc_rate: Decimal | None = None
