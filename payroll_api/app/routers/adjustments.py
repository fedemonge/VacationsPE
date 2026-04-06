"""Payroll adjustment endpoints — post-close corrections."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.services import adjustment_service

router = APIRouter(prefix="/adjustments", tags=["Ajustes de Planilla"])


class AdjustmentCreate(BaseModel):
    period_id: uuid.UUID
    employee_id: uuid.UUID
    concept_id: uuid.UUID
    adjustment_type: str  # CORRECCION, REINTEGRO, DESCUENTO_POSTERIOR
    original_amount: float | None = None
    adjusted_amount: float
    reason: str


@router.get("/period/{period_id}")
async def list_adjustments(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    adjs = await adjustment_service.list_adjustments(db, period_id)
    return [
        {
            "id": str(a.id),
            "employee_id": str(a.employee_id),
            "concept_id": str(a.concept_id),
            "adjustment_type": a.adjustment_type,
            "original_amount": str(a.original_amount) if a.original_amount else None,
            "adjusted_amount": str(a.adjusted_amount),
            "difference": str(a.difference),
            "reason": a.reason,
            "adjusted_by": a.adjusted_by,
            "approved_by": a.approved_by,
            "status": a.status,
            "created_at": a.created_at.isoformat(),
        }
        for a in adjs
    ]


@router.post("/", status_code=201)
async def create_adjustment(
    data: AdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    from app.routers.employees import _get_company_id
    company_id = await _get_company_id(db)
    try:
        adj = await adjustment_service.create_adjustment(
            db, company_id, data.period_id, data.employee_id, data.concept_id,
            data.adjustment_type, data.original_amount, data.adjusted_amount,
            data.reason, ctx,
        )
        return {"id": str(adj.id), "status": adj.status, "message": "Ajuste creado"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{adjustment_id}/approve")
async def approve_adjustment(
    adjustment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN")),
):
    try:
        adj = await adjustment_service.approve_adjustment(db, adjustment_id, ctx)
        return {"id": str(adj.id), "status": adj.status, "message": "Ajuste aprobado"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
