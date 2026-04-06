import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.audit import AuditEvent


async def log_event(
    db: AsyncSession,
    ctx: AuditContext,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    reason: str | None = None,
    company_id: uuid.UUID | None = None,
) -> AuditEvent:
    event = AuditEvent(
        company_id=company_id or uuid.UUID(int=0),
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_values=_serialize(old_values),
        new_values=_serialize(new_values),
        user_email=ctx.user_email,
        user_role=ctx.user_role,
        endpoint=ctx.endpoint,
        ip_address=ctx.ip_address,
        reason=reason,
    )
    db.add(event)
    await db.flush()
    return event


async def get_entity_history(
    db: AsyncSession,
    entity_type: str,
    entity_id: uuid.UUID,
) -> list[AuditEvent]:
    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.entity_type == entity_type, AuditEvent.entity_id == entity_id)
        .order_by(AuditEvent.created_at.desc())
    )
    return list(result.scalars().all())


async def get_events(
    db: AsyncSession,
    company_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
    entity_type: str | None = None,
    user_email: str | None = None,
) -> list[AuditEvent]:
    query = select(AuditEvent).where(AuditEvent.company_id == company_id)
    if entity_type:
        query = query.where(AuditEvent.entity_type == entity_type)
    if user_email:
        query = query.where(AuditEvent.user_email == user_email)
    query = query.order_by(AuditEvent.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


def _serialize(obj: dict[str, Any] | None) -> dict[str, Any] | None:
    if obj is None:
        return None
    result = {}
    for k, v in obj.items():
        if hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            result[k] = str(v)
        else:
            result[k] = v
    return result
