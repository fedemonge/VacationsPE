from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class BBVAGenerateRequest(BaseModel):
    layout_code: str = "BBVA_HABERES_V1"


class BBVAFileResponse(BaseModel):
    id: UUID
    period_id: UUID
    file_name: str
    file_hash: str
    total_records: int
    total_amount: Decimal
    status: str
    generated_by: str
    generated_at: datetime

    model_config = {"from_attributes": True}


class BBVAValidationError(BaseModel):
    employee_code: str
    full_name: str
    error: str
