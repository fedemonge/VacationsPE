from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CostCenterCreate(BaseModel):
    code: str
    description: str


class CostCenterUpdate(BaseModel):
    description: str | None = None
    is_active: bool | None = None


class CostCenterResponse(BaseModel):
    id: UUID
    company_id: UUID
    code: str
    description: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
