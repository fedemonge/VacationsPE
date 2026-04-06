"""
Motor de cálculo de nómina.

Orquesta el cálculo completo de un periodo:
1. Valida estado del periodo
2. Obtiene empleados activos con contratos vigentes
3. Carga variables (asistencia, HE, comisiones)
4. Ejecuta calculadora de conceptos por empleado
5. Persiste resultados (payroll_detail + payroll_detail_line)
6. Actualiza totales y estado del periodo
"""

import json
import logging
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import AuditContext
from app.models.attendance import Attendance
from app.models.commission import Commission
from app.models.concept import ConceptRule, PayrollConcept
from app.models.contract import EmploymentContract
from app.models.employee import PayrollEmployee
from app.models.legal_param import LegalParameter
from app.models.overtime import Overtime
from app.models.payroll_detail import PayrollDetail, PayrollDetailLine
from app.models.period import PayrollPeriod
from app.models.variable import PayrollVariable
from app.services import audit_service
from app.services.concept_calculator import CalculatedLine, EmployeePayrollContext, calculate_all
from app.services.tax_calculator import get_afp_rates, get_rmv_value, get_uit_value
from app.utils.date_utils import (
    get_gratification_semester,
    get_period_dates,
    is_cts_month,
    is_gratification_month,
    months_between,
)

logger = logging.getLogger(__name__)


class PayrollEngineError(Exception):
    pass


async def calculate_period(
    db: AsyncSession,
    period_id: uuid.UUID,
    company_id: uuid.UUID,
    ctx: AuditContext,
) -> dict:
    """Calculate payroll for all active employees in the period.

    Returns summary dict with counts and totals.
    """
    # 1. Load and validate period
    period = await db.get(PayrollPeriod, period_id)
    if not period:
        raise PayrollEngineError(f"Periodo {period_id} no encontrado")
    if period.status not in ("ABIERTO", "CALCULADO"):
        raise PayrollEngineError(f"Periodo en estado '{period.status}' no se puede calcular")

    logger.info(f"[PAYROLL_ENGINE] CALCULATE: periodo {period.period_label}, tipo {period.period_type}")

    # 2. If recalculating, delete previous results
    if period.status == "CALCULADO":
        await db.execute(
            delete(PayrollDetailLine).where(
                PayrollDetailLine.detail_id.in_(
                    select(PayrollDetail.id).where(PayrollDetail.period_id == period_id)
                )
            )
        )
        await db.execute(delete(PayrollDetail).where(PayrollDetail.period_id == period_id))
        await db.flush()

    period.status = "EN_CALCULO"
    await db.flush()

    # 3. Load legal parameters
    uit = await get_uit_value(db, company_id, period.period_year)
    rmv = await get_rmv_value(db, company_id, period.period_year)

    # 4. Get active employees with current contracts
    employees_result = await db.execute(
        select(PayrollEmployee)
        .where(
            PayrollEmployee.company_id == company_id,
            PayrollEmployee.employment_status == "ACTIVO",
            PayrollEmployee.is_active.is_(True),
        )
    )
    employees = list(employees_result.scalars().all())

    # 5. Process each employee
    details_created = 0
    total_neto = Decimal("0")
    errors = []

    for emp in employees:
        try:
            detail = await _calculate_employee(db, period, emp, company_id, uit, rmv)
            if detail:
                details_created += 1
                total_neto += detail.neto_a_pagar
        except Exception as e:
            logger.error(f"[PAYROLL_ENGINE] ERROR employee {emp.employee_code}: {e}")
            errors.append({"employee_code": emp.employee_code, "error": str(e)})

    # 6. Snapshot rules for reproducibility
    rules_snapshot = await _snapshot_rules(db, company_id, period.end_date)
    params_snapshot = await _snapshot_legal_params(db, company_id, period.end_date)

    # 7. Update period
    period.status = "CALCULADO"
    period.calculated_at = datetime.now()
    period.calculated_by = ctx.user_email
    period.rules_snapshot = rules_snapshot
    period.legal_params_snapshot = params_snapshot

    await db.flush()

    # 8. Audit
    await audit_service.log_event(
        db, ctx,
        entity_type="PAYROLL_PERIOD",
        entity_id=period_id,
        action="CALCULATE",
        new_values={
            "status": "CALCULADO",
            "employees_processed": details_created,
            "total_neto": str(total_neto),
            "errors": len(errors),
        },
        company_id=company_id,
    )

    return {
        "period_id": str(period_id),
        "period_label": period.period_label,
        "status": "CALCULADO",
        "employees_processed": details_created,
        "total_neto": str(total_neto),
        "errors": errors,
    }


async def _calculate_employee(
    db: AsyncSession,
    period: PayrollPeriod,
    employee: PayrollEmployee,
    company_id: uuid.UUID,
    uit: Decimal,
    rmv: Decimal,
) -> PayrollDetail | None:
    """Calculate payroll for a single employee."""
    # Get current contract
    contract_result = await db.execute(
        select(EmploymentContract)
        .where(
            EmploymentContract.employee_id == employee.id,
            EmploymentContract.is_current.is_(True),
        )
        .limit(1)
    )
    contract = contract_result.scalar_one_or_none()
    if not contract:
        logger.warning(f"[PAYROLL_ENGINE] No active contract for {employee.employee_code}")
        return None

    # Load attendance summary for the period
    att_result = await db.execute(
        select(
            func.count().filter(Attendance.status == "FALTA").label("absent"),
            func.sum(Attendance.tardiness_minutes).label("tardiness"),
        )
        .where(
            Attendance.employee_id == employee.id,
            Attendance.attendance_date >= period.start_date,
            Attendance.attendance_date <= period.end_date,
        )
    )
    att_row = att_result.one()
    days_absent = att_row.absent or 0
    total_tardiness = att_row.tardiness or 0

    # Load overtime
    ot_result = await db.execute(
        select(
            func.sum(Overtime.hours_25).label("h25"),
            func.sum(Overtime.hours_35).label("h35"),
            func.sum(Overtime.hours_100).label("h100"),
        )
        .where(
            Overtime.employee_id == employee.id,
            Overtime.overtime_date >= period.start_date,
            Overtime.overtime_date <= period.end_date,
            Overtime.is_approved.is_(True),
        )
    )
    ot_row = ot_result.one()

    # Load commissions
    comm_result = await db.execute(
        select(func.sum(Commission.amount))
        .where(
            Commission.employee_id == employee.id,
            Commission.period_year == period.period_year,
            Commission.period_month == period.period_month,
        )
    )
    total_commissions = comm_result.scalar() or Decimal("0")

    # Load additional variables
    var_result = await db.execute(
        select(PayrollVariable)
        .where(
            PayrollVariable.employee_id == employee.id,
            PayrollVariable.period_year == period.period_year,
            PayrollVariable.period_month == period.period_month,
        )
    )
    additional_vars = {}
    for v in var_result.scalars().all():
        concept = await db.get(PayrollConcept, v.concept_id)
        if concept:
            additional_vars[concept.code] = v.amount

    # Calculate months in semester for gratification/CTS
    months_in_semester = _calc_months_in_semester(employee.hire_date, period.period_year, period.period_month)

    # Get AFP rates if applicable
    afp_rates = {}
    if employee.pension_system == "AFP" and employee.pension_provider:
        afp_rates = await get_afp_rates(db, company_id, employee.pension_provider)

    # Previous months data for 5ta cat
    prev_gross, prev_tax = await _get_previous_months_data(db, employee.id, period.period_year, period.period_month)

    # Build context
    emp_ctx = EmployeePayrollContext(
        employee_id=str(employee.id),
        employee_code=employee.employee_code,
        full_name=employee.full_name,
        base_salary=contract.base_salary,
        daily_hours=contract.daily_hours,
        pension_system=employee.pension_system,
        pension_provider=employee.pension_provider or "PRIMA",
        has_5ta_cat_exemption=employee.has_5ta_cat_exemption,
        has_dependents=employee.has_dependents,
        period_year=period.period_year,
        period_month=period.period_month,
        days_worked=Decimal("30") - Decimal(str(days_absent)),
        overtime_hours_25=Decimal(str(ot_row.h25 or 0)),
        overtime_hours_35=Decimal(str(ot_row.h35 or 0)),
        overtime_hours_100=Decimal(str(ot_row.h100 or 0)),
        total_commissions=total_commissions,
        total_tardiness_minutes=total_tardiness,
        days_absent=days_absent,
        uit_value=uit,
        rmv_value=rmv,
        afp_fondo_rate=afp_rates.get("afp_fondo"),
        afp_seguro_rate=afp_rates.get("afp_seguro"),
        afp_comision_rate=afp_rates.get("afp_comision"),
        annual_gross_previous_months=prev_gross,
        tax_retained_previous_months=prev_tax,
        months_worked_in_semester=months_in_semester,
        is_gratification_month=is_gratification_month(period.period_month),
        is_cts_month=is_cts_month(period.period_month),
        additional_variables=additional_vars,
    )

    # Execute calculation
    calculated_lines = calculate_all(emp_ctx)

    # Compute totals
    total_ingresos = sum(l.amount for l in calculated_lines if l.category == "INGRESO")
    total_descuentos = sum(l.amount for l in calculated_lines if l.category == "DESCUENTO")
    total_aportes = sum(l.amount for l in calculated_lines if l.category == "APORTE_EMPLEADOR")
    neto = total_ingresos - total_descuentos

    # Create detail
    detail = PayrollDetail(
        period_id=period.id,
        employee_id=employee.id,
        contract_id=contract.id,
        cost_center_id=contract.cost_center_id,
        base_salary=contract.base_salary,
        days_worked=emp_ctx.days_worked,
        total_ingresos=total_ingresos,
        total_descuentos=total_descuentos,
        total_aportes_empleador=total_aportes,
        neto_a_pagar=neto,
        bank_account_snapshot=employee.bank_account_number,
        bank_cci_snapshot=employee.bank_cci,
    )
    db.add(detail)
    await db.flush()

    # Create detail lines
    for idx, line in enumerate(calculated_lines):
        detail_line = PayrollDetailLine(
            detail_id=detail.id,
            concept_id=await _get_or_create_concept_id(db, company_id, line),
            concept_code=line.concept_code,
            concept_name=line.concept_name,
            category=line.category,
            calc_base_amount=line.calc_base,
            calc_rate=line.calc_rate,
            calc_formula_used=line.calc_formula,
            amount=line.amount,
            display_order=idx,
        )
        db.add(detail_line)

    await db.flush()
    return detail


async def close_period(
    db: AsyncSession,
    period_id: uuid.UUID,
    ctx: AuditContext,
) -> dict:
    """Close a calculated period. After closing, no modifications allowed."""
    period = await db.get(PayrollPeriod, period_id)
    if not period:
        raise PayrollEngineError("Periodo no encontrado")
    if period.status != "CALCULADO":
        raise PayrollEngineError(f"Solo se puede cerrar un periodo CALCULADO, estado actual: {period.status}")

    period.status = "CERRADO"
    period.closed_at = datetime.now()
    period.closed_by = ctx.user_email

    # Mark all details as CERRADO
    details_result = await db.execute(
        select(PayrollDetail).where(PayrollDetail.period_id == period_id)
    )
    for detail in details_result.scalars().all():
        detail.status = "CERRADO"

    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="PAYROLL_PERIOD",
        entity_id=period_id,
        action="CLOSE",
        new_values={"status": "CERRADO", "closed_by": ctx.user_email},
        company_id=period.company_id,
    )

    return {"period_id": str(period_id), "status": "CERRADO", "closed_at": period.closed_at.isoformat()}


def _calc_months_in_semester(hire_date: date, year: int, month: int) -> int:
    """Calculate months worked in the current semester for gratification/CTS."""
    if is_gratification_month(month):
        sem_start_month, sem_end_month = get_gratification_semester(month)
    elif is_cts_month(month):
        from app.utils.date_utils import get_cts_semester
        sem_start_month, sem_end_month = get_cts_semester(month)
    else:
        return 6

    if month <= 6:
        sem_start = date(year, sem_start_month, 1)
    elif sem_start_month > month:
        sem_start = date(year - 1, sem_start_month, 1)
    else:
        sem_start = date(year, sem_start_month, 1)

    sem_end = date(year, sem_end_month, 28)

    if hire_date > sem_end:
        return 0
    effective_start = max(hire_date, sem_start)
    months = months_between(effective_start, sem_end) + 1
    return min(max(months, 0), 6)


async def _get_previous_months_data(
    db: AsyncSession,
    employee_id: uuid.UUID,
    year: int,
    current_month: int,
) -> tuple[Decimal, Decimal]:
    """Get accumulated gross and tax retained from previous months in the same year."""
    if current_month <= 1:
        return Decimal("0"), Decimal("0")

    result = await db.execute(
        select(
            func.sum(PayrollDetail.total_ingresos).label("gross"),
            func.sum(
                select(func.sum(PayrollDetailLine.amount))
                .where(
                    PayrollDetailLine.detail_id == PayrollDetail.id,
                    PayrollDetailLine.concept_code == "RENTA_5TA",
                )
                .correlate(PayrollDetail)
                .scalar_subquery()
            ).label("tax"),
        )
        .join(PayrollPeriod, PayrollDetail.period_id == PayrollPeriod.id)
        .where(
            PayrollDetail.employee_id == employee_id,
            PayrollPeriod.period_year == year,
            PayrollPeriod.period_month < current_month,
            PayrollPeriod.status.in_(["CALCULADO", "CERRADO"]),
        )
    )
    row = result.one()
    return row.gross or Decimal("0"), row.tax or Decimal("0")


async def _get_or_create_concept_id(
    db: AsyncSession,
    company_id: uuid.UUID,
    line: CalculatedLine,
) -> uuid.UUID:
    """Get concept ID by code, or create if doesn't exist (for system concepts)."""
    result = await db.execute(
        select(PayrollConcept.id)
        .where(PayrollConcept.company_id == company_id, PayrollConcept.code == line.concept_code)
    )
    concept_id = result.scalar_one_or_none()
    if concept_id:
        return concept_id

    # Auto-create system concept
    concept = PayrollConcept(
        company_id=company_id,
        code=line.concept_code,
        name=line.concept_name,
        category=line.category,
        is_system=True,
    )
    db.add(concept)
    await db.flush()
    return concept.id


async def _snapshot_rules(db: AsyncSession, company_id: uuid.UUID, as_of: date) -> dict:
    """Snapshot all active rules at a given date for reproducibility."""
    result = await db.execute(
        select(ConceptRule)
        .join(PayrollConcept)
        .where(
            PayrollConcept.company_id == company_id,
            ConceptRule.valid_from <= as_of,
            (ConceptRule.valid_to.is_(None) | (ConceptRule.valid_to >= as_of)),
        )
    )
    rules = []
    for rule in result.scalars().all():
        rules.append({
            "id": str(rule.id),
            "concept_id": str(rule.concept_id),
            "calc_type": rule.calc_type,
            "calc_base": rule.calc_base,
            "calc_value": str(rule.calc_value) if rule.calc_value else None,
            "calc_formula": rule.calc_formula,
            "valid_from": rule.valid_from.isoformat(),
            "valid_to": rule.valid_to.isoformat() if rule.valid_to else None,
        })
    return {"rules": rules, "snapshot_date": as_of.isoformat()}


async def _snapshot_legal_params(db: AsyncSession, company_id: uuid.UUID, as_of: date) -> dict:
    """Snapshot all active legal parameters at a given date."""
    result = await db.execute(
        select(LegalParameter)
        .where(
            LegalParameter.company_id == company_id,
            LegalParameter.valid_from <= as_of,
            (LegalParameter.valid_to.is_(None) | (LegalParameter.valid_to >= as_of)),
        )
    )
    params = []
    for p in result.scalars().all():
        params.append({
            "key": p.param_key,
            "value": str(p.param_value),
            "valid_from": p.valid_from.isoformat(),
        })
    return {"params": params, "snapshot_date": as_of.isoformat()}
