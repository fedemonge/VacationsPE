from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel


class AttendanceCreate(BaseModel):
    employee_id: UUID
    attendance_date: date
    clock_in: time | None = None
    clock_out: time | None = None
    hours_worked: float | None = None
    status: str = "PRESENTE"
    tardiness_minutes: int = 0
    absence_reason: str | None = None


class AttendanceResponse(BaseModel):
    id: UUID
    employee_id: UUID
    attendance_date: date
    clock_in: time | None
    clock_out: time | None
    hours_worked: float | None
    status: str
    tardiness_minutes: int
    absence_reason: str | None
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AttendanceSummary(BaseModel):
    employee_id: UUID
    employee_code: str
    full_name: str
    days_present: int
    days_absent: int
    days_late: int
    total_tardiness_minutes: int
    total_hours_worked: float
