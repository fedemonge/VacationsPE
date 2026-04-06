from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, field_validator


class ContractCreate(BaseModel):
    employee_id: UUID
    contract_type: str  # INDEFINIDO, PLAZO_FIJO, PARCIAL, FORMATIVO
    start_date: date
    end_date: date | None = None
    base_salary: Decimal
    cost_center_id: UUID
    position_title: str | None = None
    work_schedule: str = "48H"
    daily_hours: Decimal = Decimal("8.0")

    @field_validator("contract_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        valid = ("INDEFINIDO", "PLAZO_FIJO", "PARCIAL", "FORMATIVO")
        if v not in valid:
            raise ValueError(f"contract_type debe ser uno de {valid}")
        return v


class ContractResponse(BaseModel):
    id: UUID
    company_id: UUID
    employee_id: UUID
    contract_type: str
    start_date: date
    end_date: date | None
    base_salary: Decimal
    cost_center_id: UUID
    position_title: str | None
    work_schedule: str
    daily_hours: Decimal
    is_current: bool
    daily_rate: Decimal
    hourly_rate: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
