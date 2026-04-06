"""BBVA payment file generation endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.models.payment_file import PaymentFile
from app.routers.employees import _get_company_id
from app.schemas.bbva import BBVAFileResponse, BBVAGenerateRequest
from app.services import bbva_service

router = APIRouter(prefix="/bbva", tags=["Pagos BBVA"])


@router.post("/generate/{period_id}", response_model=BBVAFileResponse)
async def generate_bbva_file(
    period_id: uuid.UUID,
    data: BBVAGenerateRequest | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "FINANZAS")),
):
    company_id = await _get_company_id(db)
    layout_code = data.layout_code if data else "BBVA_HABERES_V1"
    try:
        payment_file = await bbva_service.generate_payment_file(
            db, period_id, company_id, layout_code, ctx
        )
        return BBVAFileResponse.model_validate(payment_file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/files", response_model=list[BBVAFileResponse])
async def list_bbva_files(
    period_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    query = select(PaymentFile).where(PaymentFile.company_id == company_id)
    if period_id:
        query = query.where(PaymentFile.period_id == period_id)
    query = query.order_by(PaymentFile.generated_at.desc())
    result = await db.execute(query)
    return [BBVAFileResponse.model_validate(f) for f in result.scalars().all()]


@router.get("/download/{file_id}")
async def download_bbva_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "FINANZAS")),
):
    payment_file = await db.get(PaymentFile, file_id)
    if not payment_file:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    if payment_file.file_content:
        return Response(
            content=payment_file.file_content,
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={payment_file.file_name}"},
        )

    # TODO: Download from S3
    raise HTTPException(status_code=404, detail="Archivo no disponible localmente")


@router.post("/regenerate/{file_id}", response_model=BBVAFileResponse)
async def regenerate_bbva_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "FINANZAS")),
):
    try:
        new_file = await bbva_service.regenerate_payment_file(db, file_id, ctx)
        return BBVAFileResponse.model_validate(new_file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
