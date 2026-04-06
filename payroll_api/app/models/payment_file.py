import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SCHEMA = "payroll"


class PaymentFileLayout(Base):
    __tablename__ = "payment_file_layout"
    __table_args__ = (
        UniqueConstraint("company_id", "layout_code", name="uq_layout_code"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    layout_code: Mapped[str] = mapped_column(String(50), nullable=False)
    layout_name: Mapped[str] = mapped_column(String(200), nullable=False)
    bank_code: Mapped[str] = mapped_column(String(10), nullable=False)
    file_extension: Mapped[str] = mapped_column(String(10), default=".txt")
    encoding: Mapped[str] = mapped_column(String(20), default="UTF-8")
    line_separator: Mapped[str] = mapped_column(String(10), default="CRLF")
    header_fields: Mapped[dict] = mapped_column(JSONB, default=list)
    detail_fields: Mapped[dict] = mapped_column(JSONB, nullable=False)
    footer_fields: Mapped[dict] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    files: Mapped[list["PaymentFile"]] = relationship(back_populates="layout")


class PaymentFile(Base):
    __tablename__ = "payment_file"
    __table_args__ = (
        Index("idx_payment_file_period", "period_id"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False)
    layout_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payment_file_layout.id"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(200), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)
    total_records: Mapped[int] = mapped_column(Integer, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    s3_key: Mapped[str | None] = mapped_column(String(500))
    file_content: Mapped[str | None] = mapped_column(Text)  # Store locally if S3 not configured
    status: Mapped[str] = mapped_column(String(20), default="GENERADO")
    generated_by: Mapped[str] = mapped_column(String(200), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Relationships
    period: Mapped["PayrollPeriod"] = relationship(back_populates="payment_files")  # noqa: F821
    layout: Mapped["PaymentFileLayout"] = relationship(back_populates="files")
