"""Contract CRUD endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.routers.employees import _get_company_id
from app.schemas.contract import ContractCreate, ContractResponse
from app.services import contract_service

router = APIRouter(prefix="/contracts", tags=["Contratos"])


@router.get("/employee/{employee_id}", response_model=list[ContractResponse])
async def get_employee_contracts(
    employee_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    contracts = await contract_service.get_employee_contracts(db, employee_id)
    return [ContractResponse.model_validate(c) for c in contracts]


@router.post("/", response_model=ContractResponse, status_code=201)
async def create_contract(
    data: ContractCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    contract = await contract_service.create_contract(db, company_id, data, ctx)
    return ContractResponse.model_validate(contract)


@router.get("/{contract_id}/history", response_model=list[dict])
async def get_contract_history(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "AUDITOR")),
):
    from app.services.audit_service import get_entity_history
    events = await get_entity_history(db, "CONTRACT", contract_id)
    return [
        {
            "action": e.action,
            "old_values": e.old_values,
            "new_values": e.new_values,
            "user_email": e.user_email,
            "reason": e.reason,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
