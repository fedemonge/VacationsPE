"""Commission management endpoints."""

import uuid

from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.models.commission import Commission
from app.routers.employees import _get_company_id
from app.schemas.commission import CommissionCreate, CommissionResponse
from app.services import import_service

router = APIRouter(prefix="/commissions", tags=["Comisiones"])


@router.post("/import")
async def import_commissions(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    content = (await file.read()).decode("utf-8-sig")
    return await import_service.import_commissions_csv(
        db, company_id, content, file.filename or "upload.csv", ctx
    )


@router.get("/", response_model=list[CommissionResponse])
async def list_commissions(
    period_year: int = Query(...),
    period_month: int = Query(...),
    employee_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    query = select(Commission).where(
        Commission.company_id == company_id,
        Commission.period_year == period_year,
        Commission.period_month == period_month,
    )
    if employee_id:
        query = query.where(Commission.employee_id == employee_id)
    result = await db.execute(query.order_by(Commission.created_at.desc()))
    return [CommissionResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/", response_model=CommissionResponse, status_code=201)
async def create_commission(
    data: CommissionCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    comm = Commission(
        company_id=company_id,
        employee_id=data.employee_id,
        period_year=data.period_year,
        period_month=data.period_month,
        concept_code=data.concept_code,
        description=data.description,
        amount=data.amount,
        is_remunerative=data.is_remunerative,
        source="MANUAL",
    )
    db.add(comm)
    await db.flush()
    return CommissionResponse.model_validate(comm)
