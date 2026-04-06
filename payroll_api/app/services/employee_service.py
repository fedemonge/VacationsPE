"""Employee CRUD service."""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.employee import PayrollEmployee
from app.schemas.employee import EmployeeCreate, EmployeeUpdate
from app.services import audit_service


async def list_employees(
    db: AsyncSession,
    company_id: uuid.UUID,
    status: str | None = None,
    cost_center_id: uuid.UUID | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PayrollEmployee], int]:
    query = select(PayrollEmployee).where(PayrollEmployee.company_id == company_id)

    if status:
        query = query.where(PayrollEmployee.employment_status == status)
    if search:
        query = query.where(
            PayrollEmployee.full_name.ilike(f"%{search}%")
            | PayrollEmployee.employee_code.ilike(f"%{search}%")
            | PayrollEmployee.document_number.ilike(f"%{search}%")
        )

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    query = query.order_by(PayrollEmployee.full_name).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def get_employee(db: AsyncSession, employee_id: uuid.UUID) -> PayrollEmployee | None:
    return await db.get(PayrollEmployee, employee_id)


async def create_employee(
    db: AsyncSession,
    company_id: uuid.UUID,
    data: EmployeeCreate,
    ctx: AuditContext,
) -> PayrollEmployee:
    full_name = f"{data.first_name} {data.paternal_surname}"
    if data.maternal_surname:
        full_name += f" {data.maternal_surname}"

    employee = PayrollEmployee(
        company_id=company_id,
        employee_code=data.employee_code,
        external_employee_id=data.external_employee_id,
        document_type=data.document_type,
        document_number=data.document_number,
        first_name=data.first_name,
        paternal_surname=data.paternal_surname,
        maternal_surname=data.maternal_surname,
        full_name=full_name,
        email=data.email,
        phone=data.phone,
        birth_date=data.birth_date,
        gender=data.gender,
        address=data.address,
        bank_code=data.bank_code,
        bank_account_number=data.bank_account_number,
        bank_cci=data.bank_cci,
        account_currency=data.account_currency,
        hire_date=data.hire_date,
        pension_system=data.pension_system,
        pension_provider=data.pension_provider,
        cuspp=data.cuspp,
        has_5ta_cat_exemption=data.has_5ta_cat_exemption,
        has_dependents=data.has_dependents,
    )
    db.add(employee)
    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="EMPLOYEE",
        entity_id=employee.id,
        action="CREATE",
        new_values=data.model_dump(mode="json"),
        company_id=company_id,
    )

    return employee


async def update_employee(
    db: AsyncSession,
    employee_id: uuid.UUID,
    data: EmployeeUpdate,
    ctx: AuditContext,
    reason: str | None = None,
) -> PayrollEmployee | None:
    employee = await db.get(PayrollEmployee, employee_id)
    if not employee:
        return None

    old_values: dict[str, Any] = {}
    new_values: dict[str, Any] = {}
    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        old_val = getattr(employee, field)
        if old_val != value:
            old_values[field] = old_val if not hasattr(old_val, "isoformat") else old_val.isoformat()
            new_values[field] = value if not hasattr(value, "isoformat") else value.isoformat()
            setattr(employee, field, value)

    if new_values:
        await audit_service.log_event(
            db, ctx,
            entity_type="EMPLOYEE",
            entity_id=employee_id,
            action="UPDATE",
            old_values=old_values,
            new_values=new_values,
            reason=reason,
            company_id=employee.company_id,
        )

    await db.flush()
    return employee
