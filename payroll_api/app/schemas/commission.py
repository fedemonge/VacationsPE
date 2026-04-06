from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class CommissionCreate(BaseModel):
    employee_id: UUID
    period_year: int
    period_month: int
    concept_code: str = "COMISION"
    description: str | None = None
    amount: Decimal
    is_remunerative: bool = True


class CommissionResponse(BaseModel):
    id: UUID
    employee_id: UUID
    period_year: int
    period_month: int
    concept_code: str
    description: str | None
    amount: Decimal
    is_remunerative: bool
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}
