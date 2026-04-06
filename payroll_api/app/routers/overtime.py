"""Overtime import and management endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.models.overtime import Overtime
from app.routers.employees import _get_company_id
from app.schemas.overtime import OvertimeCreate, OvertimeResponse
from app.services import import_service

router = APIRouter(prefix="/overtime", tags=["Horas Extra"])


@router.post("/import")
async def import_overtime(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    content = (await file.read()).decode("utf-8-sig")
    return await import_service.import_overtime_csv(
        db, company_id, content, file.filename or "upload.csv", ctx
    )


@router.post("/", response_model=OvertimeResponse, status_code=201)
async def create_overtime(
    data: OvertimeCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    ot = Overtime(
        company_id=company_id,
        employee_id=data.employee_id,
        overtime_date=data.overtime_date,
        hours_25=data.hours_25,
        hours_35=data.hours_35,
        hours_100=data.hours_100,
        source="MANUAL",
    )
    db.add(ot)
    await db.flush()
    return OvertimeResponse.model_validate(ot)


@router.patch("/{ot_id}/approve")
async def approve_overtime(
    ot_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "JEFE_AREA")),
):
    ot = await db.get(Overtime, ot_id)
    if not ot:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    ot.is_approved = True
    ot.approved_by = ctx.user_email
    await db.flush()
    return {"message": "Horas extra aprobadas", "id": str(ot_id)}
