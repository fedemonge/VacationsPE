"""Reporting endpoints — payroll, overtime, commissions, SUNAFIL."""

import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.routers.employees import _get_company_id
from app.services import report_service
from app.utils.export import export_to_csv, export_to_xlsx

router = APIRouter(prefix="/reports", tags=["Reportes"])


@router.get("/payroll-summary")
async def payroll_summary(
    period_id: uuid.UUID = Query(...),
    cost_center_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "JEFE_AREA", "AUDITOR")),
):
    return await report_service.get_payroll_summary_by_cost_center(db, period_id, cost_center_id)


@router.get("/by-concept")
async def by_concept(
    period_id: uuid.UUID = Query(...),
    cost_center_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    return await report_service.get_by_concept_report(db, period_id, cost_center_id)


@router.get("/overtime")
async def overtime_ranking(
    year: int = Query(...),
    month: int = Query(...),
    cost_center_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "JEFE_AREA", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    return await report_service.get_overtime_ranking(db, company_id, year, month, cost_center_id)


@router.get("/commissions")
async def commissions_report(
    year: int = Query(...),
    month: int = Query(...),
    cost_center_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    return await report_service.get_commission_report(db, company_id, year, month, cost_center_id)


@router.get("/vacation-provision")
async def vacation_provision(
    cost_center_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    return await report_service.get_vacation_provision(db, company_id, cost_center_id)


@router.get("/sunafil/attendance")
async def sunafil_attendance(
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    return await report_service.get_sunafil_attendance(db, company_id, year, month)


@router.get("/export/{report_type}")
async def export_report(
    report_type: str,
    format: str = Query("xlsx", pattern="^(csv|xlsx)$"),
    period_id: uuid.UUID | None = None,
    year: int | None = None,
    month: int | None = None,
    cost_center_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)

    if report_type == "payroll_summary" and period_id:
        data = await report_service.get_payroll_summary_by_cost_center(db, period_id, cost_center_id)
        headers = ["Centro Costo", "Descripción", "Headcount", "Ingresos", "Descuentos", "Aportes", "Neto"]
        keys = ["cc_code", "cc_desc", "headcount", "total_ingresos", "total_descuentos", "total_aportes", "total_neto"]
    elif report_type == "overtime" and year and month:
        data = await report_service.get_overtime_ranking(db, company_id, year, month, cost_center_id)
        headers = ["Código", "Nombre", "CC", "HE 25%", "HE 35%", "HE 100%", "Total Horas", "Valor Total"]
        keys = ["employee_code", "full_name", "cost_center", "hours_25", "hours_35", "hours_100", "total_hours", "total_value"]
    elif report_type == "vacation_provision":
        data = await report_service.get_vacation_provision(db, company_id, cost_center_id)
        headers = ["Código", "Nombre", "CC", "Sueldo", "Tarifa Diaria", "Días Pend.", "Provisión"]
        keys = ["employee_code", "full_name", "cost_center", "base_salary", "daily_rate", "pending_days", "provision_amount"]
    else:
        return {"error": "report_type no soportado o faltan parámetros"}

    if format == "csv":
        content = export_to_csv(headers, data, keys)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={report_type}.csv"},
        )

    xlsx_bytes = export_to_xlsx(headers, data, keys, title=f"Reporte: {report_type}")
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={report_type}.xlsx"},
    )
