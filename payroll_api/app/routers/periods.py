"""Payroll period management and calculation endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.models.payroll_detail import PayrollDetail, PayrollDetailLine
from app.models.employee import PayrollEmployee
from app.routers.employees import _get_company_id
from app.schemas.period import PeriodCreate, PeriodResponse
from app.services import period_service
from app.services.payroll_engine import PayrollEngineError, calculate_period, close_period

router = APIRouter(prefix="/periods", tags=["Periodos de Planilla"])


@router.get("/", response_model=list[PeriodResponse])
async def list_periods(
    year: int | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    periods = await period_service.list_periods(db, company_id, year=year, status=status)
    return [PeriodResponse.model_validate(p) for p in periods]


@router.post("/", response_model=PeriodResponse, status_code=201)
async def create_period(
    data: PeriodCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    period = await period_service.create_period(db, company_id, data, ctx)
    return PeriodResponse.model_validate(period)


@router.post("/{period_id}/calculate")
async def calculate_payroll(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    try:
        result = await calculate_period(db, period_id, company_id, ctx)
        return result
    except PayrollEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{period_id}/close")
async def close_payroll_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN")),
):
    try:
        result = await close_period(db, period_id, ctx)
        return result
    except PayrollEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{period_id}/summary")
async def get_period_summary(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    return await period_service.get_period_summary(db, period_id)


@router.get("/{period_id}/detail")
async def get_period_detail(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    result = await db.execute(
        select(PayrollDetail)
        .options(selectinload(PayrollDetail.lines))
        .where(PayrollDetail.period_id == period_id)
    )
    details = result.scalars().all()

    items = []
    for d in details:
        emp = await db.get(PayrollEmployee, d.employee_id)
        items.append({
            "employee_id": str(d.employee_id),
            "employee_code": emp.employee_code if emp else "",
            "full_name": emp.full_name if emp else "",
            "base_salary": str(d.base_salary),
            "days_worked": str(d.days_worked),
            "total_ingresos": str(d.total_ingresos),
            "total_descuentos": str(d.total_descuentos),
            "total_aportes_empleador": str(d.total_aportes_empleador),
            "neto_a_pagar": str(d.neto_a_pagar),
            "lines": [
                {
                    "concept_code": l.concept_code,
                    "concept_name": l.concept_name,
                    "category": l.category,
                    "amount": str(l.amount),
                    "calc_base_amount": str(l.calc_base_amount) if l.calc_base_amount else None,
                    "calc_rate": str(l.calc_rate) if l.calc_rate else None,
                }
                for l in sorted(d.lines, key=lambda x: x.display_order)
            ],
        })

    return {"period_id": str(period_id), "employees": items}
