"""Audit trail endpoints."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.routers.employees import _get_company_id
from app.schemas.common import AuditInfo
from app.services import audit_service

router = APIRouter(prefix="/audit", tags=["Auditoría"])


@router.get("/events", response_model=list[AuditInfo])
async def list_events(
    entity_type: str | None = None,
    user_email: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    events = await audit_service.get_events(
        db, company_id, limit=limit, offset=offset,
        entity_type=entity_type, user_email=user_email,
    )
    return [AuditInfo.model_validate(e) for e in events]


@router.get("/entity/{entity_type}/{entity_id}", response_model=list[AuditInfo])
async def get_entity_history(
    entity_type: str,
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "AUDITOR")),
):
    events = await audit_service.get_entity_history(db, entity_type, entity_id)
    return [AuditInfo.model_validate(e) for e in events]
