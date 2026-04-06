"""Cost center CRUD endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.models.cost_center import CostCenter
from app.routers.employees import _get_company_id
from app.schemas.cost_center import CostCenterCreate, CostCenterResponse, CostCenterUpdate
from app.services import audit_service

router = APIRouter(prefix="/cost-centers", tags=["Centros de Costo"])


@router.get("/", response_model=list[CostCenterResponse])
async def list_cost_centers(
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "JEFE_AREA", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    result = await db.execute(
        select(CostCenter)
        .where(CostCenter.company_id == company_id)
        .order_by(CostCenter.code)
    )
    return [CostCenterResponse.model_validate(cc) for cc in result.scalars().all()]


@router.post("/", response_model=CostCenterResponse, status_code=201)
async def create_cost_center(
    data: CostCenterCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    cc = CostCenter(company_id=company_id, code=data.code, description=data.description)
    db.add(cc)
    await db.flush()
    await audit_service.log_event(
        db, ctx, entity_type="COST_CENTER", entity_id=cc.id,
        action="CREATE", new_values=data.model_dump(), company_id=company_id,
    )
    return CostCenterResponse.model_validate(cc)


@router.patch("/{cc_id}", response_model=CostCenterResponse)
async def update_cost_center(
    cc_id: uuid.UUID,
    data: CostCenterUpdate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    cc = await db.get(CostCenter, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Centro de costo no encontrado")
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(cc, k, v)
    await db.flush()
    return CostCenterResponse.model_validate(cc)
