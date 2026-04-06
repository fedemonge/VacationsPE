from decimal import Decimal

from pydantic import BaseModel


class PayrollSummaryRow(BaseModel):
    cost_center_code: str | None  # None = Total Compañía
    cost_center_desc: str | None
    headcount: int
    total_ingresos: Decimal
    total_descuentos: Decimal
    total_aportes_empleador: Decimal
    total_neto: Decimal


class ConceptSummaryRow(BaseModel):
    concept_code: str
    concept_name: str
    category: str
    cost_center_code: str | None
    total: Decimal


class OvertimeRankingRow(BaseModel):
    employee_code: str
    full_name: str
    cost_center: str
    hours_25: Decimal
    hours_35: Decimal
    hours_100: Decimal
    total_hours: Decimal
    total_value: Decimal


class CommissionSummaryRow(BaseModel):
    employee_code: str
    full_name: str
    cost_center: str
    total_commissions: Decimal


class VacationProvisionRow(BaseModel):
    employee_code: str
    full_name: str
    cost_center: str
    base_salary: Decimal
    daily_rate: Decimal
    pending_days: Decimal
    provision_amount: Decimal


class ExportRequest(BaseModel):
    report_type: str  # payroll_summary, by_concept, overtime, commissions, vacation_provision
    format: str = "xlsx"  # csv, xlsx, pdf
    period_year: int | None = None
    period_month: int | None = None
    cost_center_id: str | None = None  # None = Total Compañía
