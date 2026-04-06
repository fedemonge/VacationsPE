"""Contract CRUD service."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.contract import EmploymentContract
from app.schemas.contract import ContractCreate
from app.services import audit_service


async def get_employee_contracts(
    db: AsyncSession,
    employee_id: uuid.UUID,
) -> list[EmploymentContract]:
    result = await db.execute(
        select(EmploymentContract)
        .where(EmploymentContract.employee_id == employee_id)
        .order_by(EmploymentContract.start_date.desc())
    )
    return list(result.scalars().all())


async def get_current_contract(
    db: AsyncSession,
    employee_id: uuid.UUID,
) -> EmploymentContract | None:
    result = await db.execute(
        select(EmploymentContract)
        .where(
            EmploymentContract.employee_id == employee_id,
            EmploymentContract.is_current.is_(True),
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_contract(
    db: AsyncSession,
    company_id: uuid.UUID,
    data: ContractCreate,
    ctx: AuditContext,
) -> EmploymentContract:
    # Close any existing current contract
    current = await get_current_contract(db, data.employee_id)
    if current:
        current.is_current = False
        current.end_date = current.end_date or data.start_date
        await audit_service.log_event(
            db, ctx,
            entity_type="CONTRACT",
            entity_id=current.id,
            action="UPDATE",
            old_values={"is_current": True},
            new_values={"is_current": False, "end_date": str(current.end_date)},
            reason="Reemplazado por nuevo contrato",
            company_id=company_id,
        )

    contract = EmploymentContract(
        company_id=company_id,
        employee_id=data.employee_id,
        contract_type=data.contract_type,
        start_date=data.start_date,
        end_date=data.end_date,
        base_salary=data.base_salary,
        cost_center_id=data.cost_center_id,
        position_title=data.position_title,
        work_schedule=data.work_schedule,
        daily_hours=data.daily_hours,
        is_current=True,
    )
    db.add(contract)
    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="CONTRACT",
        entity_id=contract.id,
        action="CREATE",
        new_values=data.model_dump(mode="json"),
        company_id=company_id,
    )

    return contract
