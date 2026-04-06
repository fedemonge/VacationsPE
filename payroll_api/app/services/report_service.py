"""Reporting service — payroll summaries, rankings, SUNAFIL."""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance
from app.models.commission import Commission
from app.models.contract import EmploymentContract
from app.models.cost_center import CostCenter
from app.models.employee import PayrollEmployee
from app.models.overtime import Overtime
from app.models.payroll_detail import PayrollDetail, PayrollDetailLine
from app.models.period import PayrollPeriod


async def get_payroll_summary_by_cost_center(
    db: AsyncSession,
    period_id: uuid.UUID,
    cost_center_id: uuid.UUID | None = None,
) -> list[dict]:
    """Payroll summary grouped by cost center + total row."""
    query = (
        select(
            CostCenter.code.label("cc_code"),
            CostCenter.description.label("cc_desc"),
            func.count(PayrollDetail.id).label("headcount"),
            func.sum(PayrollDetail.total_ingresos).label("total_ingresos"),
            func.sum(PayrollDetail.total_descuentos).label("total_descuentos"),
            func.sum(PayrollDetail.total_aportes_empleador).label("total_aportes"),
            func.sum(PayrollDetail.neto_a_pagar).label("total_neto"),
        )
        .join(CostCenter, PayrollDetail.cost_center_id == CostCenter.id)
        .where(PayrollDetail.period_id == period_id)
        .group_by(CostCenter.code, CostCenter.description)
        .order_by(CostCenter.code)
    )
    if cost_center_id:
        query = query.where(PayrollDetail.cost_center_id == cost_center_id)

    result = await db.execute(query)
    rows = [dict(r._mapping) for r in result.all()]

    # Add total row
    if len(rows) > 1 or not cost_center_id:
        total = {
            "cc_code": None,
            "cc_desc": "TOTAL COMPAÑÍA",
            "headcount": sum(r["headcount"] for r in rows),
            "total_ingresos": sum(r["total_ingresos"] for r in rows),
            "total_descuentos": sum(r["total_descuentos"] for r in rows),
            "total_aportes": sum(r["total_aportes"] for r in rows),
            "total_neto": sum(r["total_neto"] for r in rows),
        }
        rows.append(total)

    return rows


async def get_by_concept_report(
    db: AsyncSession,
    period_id: uuid.UUID,
    cost_center_id: uuid.UUID | None = None,
) -> list[dict]:
    """Report by concept and cost center."""
    query = (
        select(
            PayrollDetailLine.concept_code,
            PayrollDetailLine.concept_name,
            PayrollDetailLine.category,
            CostCenter.code.label("cc_code"),
            func.sum(PayrollDetailLine.amount).label("total"),
        )
        .join(PayrollDetail, PayrollDetailLine.detail_id == PayrollDetail.id)
        .join(CostCenter, PayrollDetail.cost_center_id == CostCenter.id)
        .where(PayrollDetail.period_id == period_id)
        .group_by(
            PayrollDetailLine.concept_code,
            PayrollDetailLine.concept_name,
            PayrollDetailLine.category,
            CostCenter.code,
        )
        .order_by(PayrollDetailLine.concept_code, CostCenter.code)
    )
    if cost_center_id:
        query = query.where(PayrollDetail.cost_center_id == cost_center_id)

    result = await db.execute(query)
    return [dict(r._mapping) for r in result.all()]


async def get_overtime_ranking(
    db: AsyncSession,
    company_id: uuid.UUID,
    year: int,
    month: int,
    cost_center_id: uuid.UUID | None = None,
) -> list[dict]:
    """Overtime ranking — by total hours and estimated value."""
    from app.utils.date_utils import get_period_dates
    start_date, end_date = get_period_dates(year, month)

    query = (
        select(
            PayrollEmployee.employee_code,
            PayrollEmployee.full_name,
            CostCenter.code.label("cost_center"),
            func.sum(Overtime.hours_25).label("hours_25"),
            func.sum(Overtime.hours_35).label("hours_35"),
            func.sum(Overtime.hours_100).label("hours_100"),
            func.sum(Overtime.hours_25 + Overtime.hours_35 + Overtime.hours_100).label("total_hours"),
            EmploymentContract.base_salary,
        )
        .join(PayrollEmployee, Overtime.employee_id == PayrollEmployee.id)
        .join(EmploymentContract, (EmploymentContract.employee_id == PayrollEmployee.id) & EmploymentContract.is_current.is_(True))
        .join(CostCenter, EmploymentContract.cost_center_id == CostCenter.id)
        .where(
            Overtime.company_id == company_id,
            Overtime.overtime_date >= start_date,
            Overtime.overtime_date <= end_date,
        )
        .group_by(PayrollEmployee.employee_code, PayrollEmployee.full_name, CostCenter.code, EmploymentContract.base_salary)
        .order_by(func.sum(Overtime.hours_25 + Overtime.hours_35 + Overtime.hours_100).desc())
    )
    if cost_center_id:
        query = query.where(EmploymentContract.cost_center_id == cost_center_id)

    result = await db.execute(query)
    rows = []
    for r in result.all():
        hourly = r.base_salary / Decimal("240")
        value = (
            r.hours_25 * hourly * Decimal("1.25")
            + r.hours_35 * hourly * Decimal("1.35")
            + r.hours_100 * hourly * Decimal("2.00")
        )
        rows.append({
            "employee_code": r.employee_code,
            "full_name": r.full_name,
            "cost_center": r.cost_center,
            "hours_25": str(r.hours_25),
            "hours_35": str(r.hours_35),
            "hours_100": str(r.hours_100),
            "total_hours": str(r.total_hours),
            "total_value": str(round(value, 2)),
        })

    return rows


async def get_commission_report(
    db: AsyncSession,
    company_id: uuid.UUID,
    year: int,
    month: int,
    cost_center_id: uuid.UUID | None = None,
) -> list[dict]:
    """Commission report by employee and cost center."""
    query = (
        select(
            PayrollEmployee.employee_code,
            PayrollEmployee.full_name,
            CostCenter.code.label("cost_center"),
            func.sum(Commission.amount).label("total_commissions"),
        )
        .join(PayrollEmployee, Commission.employee_id == PayrollEmployee.id)
        .join(EmploymentContract, (EmploymentContract.employee_id == PayrollEmployee.id) & EmploymentContract.is_current.is_(True))
        .join(CostCenter, EmploymentContract.cost_center_id == CostCenter.id)
        .where(
            Commission.company_id == company_id,
            Commission.period_year == year,
            Commission.period_month == month,
        )
        .group_by(PayrollEmployee.employee_code, PayrollEmployee.full_name, CostCenter.code)
        .order_by(func.sum(Commission.amount).desc())
    )
    if cost_center_id:
        query = query.where(EmploymentContract.cost_center_id == cost_center_id)

    result = await db.execute(query)
    return [dict(r._mapping) for r in result.all()]


async def get_vacation_provision(
    db: AsyncSession,
    company_id: uuid.UUID,
    cost_center_id: uuid.UUID | None = None,
) -> list[dict]:
    """Vacation provision report — valorized pending vacation days.

    This queries the existing VacationsPE system via external_employee_id link.
    If external system is not linked, returns provision based on 30 days/year estimate.
    """
    query = (
        select(
            PayrollEmployee.employee_code,
            PayrollEmployee.full_name,
            CostCenter.code.label("cost_center"),
            EmploymentContract.base_salary,
        )
        .join(EmploymentContract, (EmploymentContract.employee_id == PayrollEmployee.id) & EmploymentContract.is_current.is_(True))
        .join(CostCenter, EmploymentContract.cost_center_id == CostCenter.id)
        .where(
            PayrollEmployee.company_id == company_id,
            PayrollEmployee.employment_status == "ACTIVO",
        )
        .order_by(PayrollEmployee.full_name)
    )
    if cost_center_id:
        query = query.where(EmploymentContract.cost_center_id == cost_center_id)

    result = await db.execute(query)
    rows = []
    for r in result.all():
        daily_rate = r.base_salary / Decimal("30")
        # TODO: Link to VacationsPE vacation accrual table for actual pending days
        # For now, estimate 30 days per year (max)
        pending_days = Decimal("30")  # Placeholder — integrate with existing vacation system
        provision = round(pending_days * daily_rate, 2)
        rows.append({
            "employee_code": r.employee_code,
            "full_name": r.full_name,
            "cost_center": r.cost_center,
            "base_salary": str(r.base_salary),
            "daily_rate": str(round(daily_rate, 2)),
            "pending_days": str(pending_days),
            "provision_amount": str(provision),
        })

    return rows


async def get_sunafil_attendance(
    db: AsyncSession,
    company_id: uuid.UUID,
    year: int,
    month: int,
) -> list[dict]:
    """SUNAFIL attendance register — DS 004-2006-TR Art. 1."""
    from app.utils.date_utils import get_period_dates
    start_date, end_date = get_period_dates(year, month)

    result = await db.execute(
        select(
            PayrollEmployee.employee_code,
            PayrollEmployee.full_name,
            PayrollEmployee.document_type,
            PayrollEmployee.document_number,
            Attendance.attendance_date,
            Attendance.clock_in,
            Attendance.clock_out,
            Attendance.hours_worked,
            Attendance.status,
            Attendance.tardiness_minutes,
        )
        .join(PayrollEmployee, Attendance.employee_id == PayrollEmployee.id)
        .where(
            Attendance.company_id == company_id,
            Attendance.attendance_date >= start_date,
            Attendance.attendance_date <= end_date,
        )
        .order_by(PayrollEmployee.employee_code, Attendance.attendance_date)
    )
    return [dict(r._mapping) for r in result.all()]
