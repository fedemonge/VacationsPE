import uuid
from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEMA = "payroll"


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("company_id", "employee_id", "attendance_date", name="uq_attendance"),
        Index("idx_attendance_date", "company_id", "attendance_date"),
        Index("idx_attendance_employee", "employee_id", "attendance_date"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.company.id"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False)
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    clock_in: Mapped[time | None] = mapped_column(Time)
    clock_out: Mapped[time | None] = mapped_column(Time)
    hours_worked: Mapped[float | None] = mapped_column(Numeric(5, 2))
    status: Mapped[str] = mapped_column(String(20), default="PRESENTE")
    # PRESENTE, FALTA, TARDANZA, PERMISO, VACACIONES, LICENCIA, DESCANSO_MEDICO, FERIADO, DESCANSO
    tardiness_minutes: Mapped[int] = mapped_column(Integer, default=0)
    absence_reason: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(30), default="BIOMETRICO")
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey(f"{SCHEMA}.import_batch.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
