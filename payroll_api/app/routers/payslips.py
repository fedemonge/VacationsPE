"""Payslip (boleta de pago) endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.routers.employees import _get_company_id
from app.services import payslip_service

router = APIRouter(prefix="/payslips", tags=["Boletas de Pago"])


@router.post("/period/{period_id}/generate")
async def generate_payslips(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    try:
        result = await payslip_service.generate_payslips(db, period_id, company_id, ctx)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{payslip_id}/download")
async def download_payslip(
    payslip_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS")),
):
    from app.models.payslip import Payslip
    payslip = await db.get(Payslip, payslip_id)
    if not payslip:
        raise HTTPException(status_code=404, detail="Boleta no encontrada")

    # TODO: Implement S3 download or local file retrieval
    # For now return metadata
    return {
        "id": str(payslip.id),
        "employee_id": str(payslip.employee_id),
        "period_id": str(payslip.period_id),
        "pdf_s3_key": payslip.pdf_s3_key,
        "pdf_hash": payslip.pdf_hash,
        "message": "Implementar descarga S3 o local",
    }
