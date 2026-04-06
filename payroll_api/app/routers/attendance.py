"""Attendance import and query endpoints."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.routers.employees import _get_company_id
from app.services import attendance_service

router = APIRouter(prefix="/attendance", tags=["Asistencia"])


@router.post("/import")
async def import_attendance(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    content = (await file.read()).decode("utf-8-sig")
    return await attendance_service.import_attendance_csv(
        db, company_id, content, file.filename or "upload.csv", ctx
    )


@router.get("/summary")
async def attendance_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    employee_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "JEFE_AREA", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    return await attendance_service.get_attendance_summary(
        db, company_id, start_date, end_date, employee_id
    )
