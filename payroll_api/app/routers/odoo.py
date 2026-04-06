"""Odoo integration endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.models.odoo_outbox import OdooOutbox
from app.routers.employees import _get_company_id
from app.services import odoo_service

router = APIRouter(prefix="/odoo", tags=["Integración Odoo"])


@router.post("/sync/{period_id}")
async def sync_to_odoo(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "FINANZAS")),
):
    company_id = await _get_company_id(db)
    try:
        entry = await odoo_service.generate_accounting_entry(db, period_id, company_id, ctx)
        return {
            "outbox_id": str(entry.id),
            "idempotency_key": entry.idempotency_key,
            "status": entry.status,
            "message": "Asiento contable generado en outbox",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/outbox")
async def list_outbox(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    query = select(OdooOutbox).where(OdooOutbox.company_id == company_id)
    if status:
        query = query.where(OdooOutbox.status == status)
    query = query.order_by(OdooOutbox.created_at.desc())
    result = await db.execute(query)
    return [
        {
            "id": str(e.id),
            "period_id": str(e.period_id),
            "event_type": e.event_type,
            "idempotency_key": e.idempotency_key,
            "status": e.status,
            "attempts": e.attempts,
            "last_error": e.last_error,
            "created_at": e.created_at.isoformat(),
        }
        for e in result.scalars().all()
    ]


@router.post("/retry/{outbox_id}")
async def retry_outbox(
    outbox_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "FINANZAS")),
):
    try:
        entry = await odoo_service.retry_outbox(db, outbox_id, ctx)
        return {"id": str(entry.id), "status": entry.status, "message": "Reintento programado"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/export-csv/{period_id}")
async def export_csv_for_odoo(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "FINANZAS")),
):
    try:
        csv_content = await odoo_service.export_csv_for_odoo(db, period_id)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=odoo_asiento_{period_id}.csv"},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
