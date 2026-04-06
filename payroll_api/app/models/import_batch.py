import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEMA = "payroll"


class ImportBatch(Base):
    __tablename__ = "import_batch"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    import_type: Mapped[str] = mapped_column(String(30), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(200))
    file_hash: Mapped[str | None] = mapped_column(String(64))
    total_records: Mapped[int | None] = mapped_column(Integer)
    processed_records: Mapped[int] = mapped_column(Integer, default=0)
    error_records: Mapped[int] = mapped_column(Integer, default=0)
    errors_detail: Mapped[dict] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(20), default="PROCESANDO")
    imported_by: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
