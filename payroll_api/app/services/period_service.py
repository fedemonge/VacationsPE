"""Payroll period CRUD and management service."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.payroll_detail import PayrollDetail
from app.models.period import PayrollPeriod
from app.schemas.period import PeriodCreate
from app.services import audit_service


async def list_periods(
    db: AsyncSession,
    company_id: uuid.UUID,
    year: int | None = None,
    status: str | None = None,
) -> list[PayrollPeriod]:
    query = select(PayrollPeriod).where(PayrollPeriod.company_id == company_id)
    if year:
        query = query.where(PayrollPeriod.period_year == year)
    if status:
        query = query.where(PayrollPeriod.status == status)
    query = query.order_by(PayrollPeriod.period_year.desc(), PayrollPeriod.period_month.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_period(
    db: AsyncSession,
    company_id: uuid.UUID,
    data: PeriodCreate,
    ctx: AuditContext,
) -> PayrollPeriod:
    period = PayrollPeriod(
        company_id=company_id,
        period_year=data.period_year,
        period_month=data.period_month,
        period_type=data.period_type,
        start_date=data.start_date,
        end_date=data.end_date,
        payment_date=data.payment_date,
        notes=data.notes,
    )
    db.add(period)
    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="PAYROLL_PERIOD",
        entity_id=period.id,
        action="CREATE",
        new_values=data.model_dump(mode="json"),
        company_id=company_id,
    )

    return period


async def get_period_summary(
    db: AsyncSession,
    period_id: uuid.UUID,
) -> dict:
    """Get aggregated summary for a period."""
    result = await db.execute(
        select(
            func.count(PayrollDetail.id).label("headcount"),
            func.sum(PayrollDetail.total_ingresos).label("total_ingresos"),
            func.sum(PayrollDetail.total_descuentos).label("total_descuentos"),
            func.sum(PayrollDetail.total_aportes_empleador).label("total_aportes"),
            func.sum(PayrollDetail.neto_a_pagar).label("total_neto"),
        )
        .where(PayrollDetail.period_id == period_id)
    )
    row = result.one()
    return {
        "headcount": row.headcount or 0,
        "total_ingresos": str(row.total_ingresos or 0),
        "total_descuentos": str(row.total_descuentos or 0),
        "total_aportes_empleador": str(row.total_aportes or 0),
        "total_neto": str(row.total_neto or 0),
    }
