from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list


class MessageResponse(BaseModel):
    message: str
    detail: str | None = None


class AuditInfo(BaseModel):
    id: int
    event_id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    old_values: dict | None = None
    new_values: dict | None = None
    user_email: str
    user_role: str | None = None
    endpoint: str | None = None
    reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
