"""
Servicio de cálculo de impuestos para Perú.

Wrapper sobre peru_tax.py con acceso a parámetros legales de la DB.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legal_param import LegalParameter
from app.utils.peru_tax import calculate_annual_tax, calculate_monthly_retention


async def get_uit_value(db: AsyncSession, company_id, year: int) -> Decimal:
    """Get UIT value for the given year from legal parameters."""
    from datetime import date

    result = await db.execute(
        select(LegalParameter)
        .where(
            LegalParameter.company_id == company_id,
            LegalParameter.param_key == "UIT",
            LegalParameter.valid_from <= date(year, 12, 31),
        )
        .order_by(LegalParameter.valid_from.desc())
        .limit(1)
    )
    param = result.scalar_one_or_none()
    if param:
        return param.param_value
    # Fallback defaults
    defaults = {2024: Decimal("5150"), 2025: Decimal("5350"), 2026: Decimal("5350")}
    return defaults.get(year, Decimal("5350"))


async def get_rmv_value(db: AsyncSession, company_id, year: int) -> Decimal:
    """Get RMV (minimum wage) value for the given year."""
    from datetime import date

    result = await db.execute(
        select(LegalParameter)
        .where(
            LegalParameter.company_id == company_id,
            LegalParameter.param_key == "RMV",
            LegalParameter.valid_from <= date(year, 12, 31),
        )
        .order_by(LegalParameter.valid_from.desc())
        .limit(1)
    )
    param = result.scalar_one_or_none()
    if param:
        return param.param_value
    return Decimal("1025")


async def get_afp_rates(db: AsyncSession, company_id, provider: str) -> dict[str, Decimal]:
    """Get AFP rates for a specific provider from legal parameters."""
    from datetime import date

    today = date.today()
    rates = {}

    for component in ("AFP_FONDO", "AFP_SEGURO", "AFP_COMISION"):
        key = f"{component}_{provider.upper()}"
        result = await db.execute(
            select(LegalParameter)
            .where(
                LegalParameter.company_id == company_id,
                LegalParameter.param_key == key,
                LegalParameter.valid_from <= today,
            )
            .order_by(LegalParameter.valid_from.desc())
            .limit(1)
        )
        param = result.scalar_one_or_none()
        if param:
            rates[component.lower()] = param.param_value

    return rates


def compute_annual_tax(annual_gross: Decimal, uit: Decimal) -> Decimal:
    return calculate_annual_tax(annual_gross, uit)


def compute_monthly_retention(
    month: int,
    annual_projected: Decimal,
    uit: Decimal,
    already_retained: Decimal,
) -> Decimal:
    return calculate_monthly_retention(month, annual_projected, uit, already_retained)
