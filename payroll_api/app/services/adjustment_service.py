"""Payroll adjustment service — post-close corrections."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.adjustment import PayrollAdjustment
from app.models.period import PayrollPeriod
from app.services import audit_service


async def create_adjustment(
    db: AsyncSession,
    company_id: uuid.UUID,
    period_id: uuid.UUID,
    employee_id: uuid.UUID,
    concept_id: uuid.UUID,
    adjustment_type: str,
    original_amount: float | None,
    adjusted_amount: float,
    reason: str,
    ctx: AuditContext,
) -> PayrollAdjustment:
    """Create an adjustment for a closed period."""
    period = await db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Periodo no encontrado")
    if period.status != "CERRADO":
        raise ValueError("Solo se pueden crear ajustes para periodos cerrados")

    from decimal import Decimal

    adj = PayrollAdjustment(
        period_id=period_id,
        employee_id=employee_id,
        concept_id=concept_id,
        adjustment_type=adjustment_type,
        original_amount=Decimal(str(original_amount)) if original_amount is not None else None,
        adjusted_amount=Decimal(str(adjusted_amount)),
        reason=reason,
        adjusted_by=ctx.user_email,
    )
    db.add(adj)
    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="ADJUSTMENT",
        entity_id=adj.id,
        action="CREATE",
        new_values={
            "period_id": str(period_id),
            "employee_id": str(employee_id),
            "type": adjustment_type,
            "amount": adjusted_amount,
            "reason": reason,
        },
        company_id=company_id,
    )

    return adj


async def approve_adjustment(
    db: AsyncSession,
    adjustment_id: uuid.UUID,
    ctx: AuditContext,
) -> PayrollAdjustment:
    adj = await db.get(PayrollAdjustment, adjustment_id)
    if not adj:
        raise ValueError("Ajuste no encontrado")
    if adj.status != "PENDIENTE":
        raise ValueError(f"Ajuste en estado '{adj.status}' no se puede aprobar")

    adj.status = "APROBADO"
    adj.approved_by = ctx.user_email

    await audit_service.log_event(
        db, ctx,
        entity_type="ADJUSTMENT",
        entity_id=adjustment_id,
        action="APPROVE",
        new_values={"status": "APROBADO", "approved_by": ctx.user_email},
        company_id=uuid.UUID(int=0),  # Will get from context
    )

    await db.flush()
    return adj


async def list_adjustments(
    db: AsyncSession,
    period_id: uuid.UUID,
) -> list[PayrollAdjustment]:
    result = await db.execute(
        select(PayrollAdjustment)
        .where(PayrollAdjustment.period_id == period_id)
        .order_by(PayrollAdjustment.created_at.desc())
    )
    return list(result.scalars().all())
