"""Legal parameter management endpoints."""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.models.legal_param import LegalParameter
from app.routers.employees import _get_company_id

router = APIRouter(prefix="/legal-params", tags=["Parámetros Legales"])


@router.get("/")
async def list_legal_params(
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    today = date.today()
    result = await db.execute(
        select(LegalParameter)
        .where(
            LegalParameter.company_id == company_id,
            LegalParameter.valid_from <= today,
            (LegalParameter.valid_to.is_(None) | (LegalParameter.valid_to >= today)),
        )
        .order_by(LegalParameter.param_key, LegalParameter.valid_from.desc())
    )
    return [
        {
            "id": str(p.id),
            "param_key": p.param_key,
            "param_value": str(p.param_value),
            "valid_from": p.valid_from.isoformat(),
            "valid_to": p.valid_to.isoformat() if p.valid_to else None,
            "description": p.description,
            "legal_reference": p.legal_reference,
        }
        for p in result.scalars().all()
    ]


@router.post("/", status_code=201)
async def create_legal_param(
    param_key: str,
    param_value: float,
    valid_from: date,
    valid_to: date | None = None,
    description: str | None = None,
    legal_reference: str | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN")),
):
    from decimal import Decimal
    company_id = await _get_company_id(db)
    param = LegalParameter(
        company_id=company_id,
        param_key=param_key,
        param_value=Decimal(str(param_value)),
        valid_from=valid_from,
        valid_to=valid_to,
        description=description,
        legal_reference=legal_reference,
    )
    db.add(param)
    await db.flush()
    return {"id": str(param.id), "param_key": param_key, "message": "Parámetro creado"}
