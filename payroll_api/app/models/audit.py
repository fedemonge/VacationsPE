import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEMA = "payroll"


class AuditEvent(Base):
    """Append-only audit log. Never UPDATE or DELETE rows from this table."""

    __tablename__ = "audit_event"
    __table_args__ = (
        Index("idx_audit_entity", "entity_type", "entity_id"),
        Index("idx_audit_user", "user_email"),
        Index("idx_audit_date", "created_at"),
        Index("idx_audit_company", "company_id", "created_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # What
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)

    # Changes
    old_values: Mapped[dict | None] = mapped_column(JSONB)
    new_values: Mapped[dict | None] = mapped_column(JSONB)

    # Who
    user_email: Mapped[str] = mapped_column(String(200), nullable=False)
    user_role: Mapped[str | None] = mapped_column(String(50))

    # Where
    endpoint: Mapped[str | None] = mapped_column(String(200))
    ip_address: Mapped[str | None] = mapped_column(String(45))

    # Why
    reason: Mapped[str | None] = mapped_column(Text)

    # When
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
