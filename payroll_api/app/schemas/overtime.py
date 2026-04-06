from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class OvertimeCreate(BaseModel):
    employee_id: UUID
    overtime_date: date
    hours_25: Decimal = Decimal("0")
    hours_35: Decimal = Decimal("0")
    hours_100: Decimal = Decimal("0")


class OvertimeResponse(BaseModel):
    id: UUID
    employee_id: UUID
    overtime_date: date
    hours_25: Decimal
    hours_35: Decimal
    hours_100: Decimal
    total_hours: Decimal
    is_approved: bool
    approved_by: str | None
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}
