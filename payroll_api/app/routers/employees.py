"""Employee CRUD endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, PaginationParams, get_audit_context, get_pagination, require_roles
from app.schemas.employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate
from app.services import employee_service
from app.services.contract_service import get_current_contract

router = APIRouter(prefix="/employees", tags=["Empleados"])


async def _get_company_id(db: AsyncSession) -> uuid.UUID:
    """Get default company ID. In multi-tenant, this would come from auth context."""
    from sqlalchemy import select
    from app.models.company import Company
    result = await db.execute(select(Company.id).limit(1))
    company_id = result.scalar_one_or_none()
    if not company_id:
        raise HTTPException(status_code=500, detail="No hay empresa configurada")
    return company_id


@router.get("/", response_model=dict)
async def list_employees(
    status: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
    pagination: PaginationParams = Depends(get_pagination),
):
    company_id = await _get_company_id(db)
    employees, total = await employee_service.list_employees(
        db, company_id, status=status, search=search,
        limit=pagination.page_size, offset=pagination.offset,
    )

    items = []
    for emp in employees:
        resp = EmployeeResponse.model_validate(emp)
        contract = await get_current_contract(db, emp.id)
        if contract:
            resp.current_salary = contract.base_salary
            resp.current_position = contract.position_title
        items.append(resp.model_dump(mode="json"))

    return {"items": items, "total": total, "page": pagination.page, "page_size": pagination.page_size}


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    emp = await employee_service.get_employee(db, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    resp = EmployeeResponse.model_validate(emp)
    contract = await get_current_contract(db, emp.id)
    if contract:
        resp.current_salary = contract.base_salary
        resp.current_position = contract.position_title
    return resp


@router.post("/", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    company_id = await _get_company_id(db)
    emp = await employee_service.create_employee(db, company_id, data, ctx)
    return EmployeeResponse.model_validate(emp)


@router.patch("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: uuid.UUID,
    data: EmployeeUpdate,
    reason: str | None = Query(None, description="Motivo del cambio"),
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH")),
):
    emp = await employee_service.update_employee(db, employee_id, data, ctx, reason)
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    return EmployeeResponse.model_validate(emp)
