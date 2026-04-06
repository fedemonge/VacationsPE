"""Attendance import and query service."""

import csv
import io
import uuid
from datetime import date, datetime, time

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.attendance import Attendance
from app.models.employee import PayrollEmployee
from app.models.import_batch import ImportBatch
from app.services import audit_service


async def import_attendance_csv(
    db: AsyncSession,
    company_id: uuid.UUID,
    file_content: str,
    file_name: str,
    ctx: AuditContext,
) -> dict:
    """Import attendance records from CSV.

    Expected columns: employee_code, date (YYYY-MM-DD), clock_in (HH:MM), clock_out (HH:MM), status
    """
    batch = ImportBatch(
        company_id=company_id,
        import_type="ASISTENCIA",
        file_name=file_name,
        imported_by=ctx.user_email,
    )
    db.add(batch)
    await db.flush()

    reader = csv.DictReader(io.StringIO(file_content))
    total = 0
    processed = 0
    errors = []

    for row_num, row in enumerate(reader, start=2):
        total += 1
        try:
            emp_code = row.get("employee_code", "").strip()
            att_date_str = row.get("date", "").strip()
            clock_in_str = row.get("clock_in", "").strip()
            clock_out_str = row.get("clock_out", "").strip()
            status = row.get("status", "PRESENTE").strip().upper()

            if not emp_code or not att_date_str:
                errors.append({"row": row_num, "error": "employee_code y date son requeridos"})
                continue

            # Find employee
            emp_result = await db.execute(
                select(PayrollEmployee.id)
                .where(PayrollEmployee.company_id == company_id, PayrollEmployee.employee_code == emp_code)
            )
            emp_id = emp_result.scalar_one_or_none()
            if not emp_id:
                errors.append({"row": row_num, "error": f"Empleado {emp_code} no encontrado"})
                continue

            att_date = date.fromisoformat(att_date_str)
            clock_in = time.fromisoformat(clock_in_str) if clock_in_str else None
            clock_out = time.fromisoformat(clock_out_str) if clock_out_str else None

            hours_worked = None
            tardiness = 0
            if clock_in and clock_out:
                delta = datetime.combine(att_date, clock_out) - datetime.combine(att_date, clock_in)
                hours_worked = round(delta.total_seconds() / 3600, 2)

            # Upsert
            existing = await db.execute(
                select(Attendance)
                .where(
                    Attendance.company_id == company_id,
                    Attendance.employee_id == emp_id,
                    Attendance.attendance_date == att_date,
                )
            )
            att = existing.scalar_one_or_none()
            if att:
                att.clock_in = clock_in
                att.clock_out = clock_out
                att.hours_worked = hours_worked
                att.status = status
                att.import_batch_id = batch.id
            else:
                att = Attendance(
                    company_id=company_id,
                    employee_id=emp_id,
                    attendance_date=att_date,
                    clock_in=clock_in,
                    clock_out=clock_out,
                    hours_worked=hours_worked,
                    status=status,
                    source="CSV_IMPORT",
                    import_batch_id=batch.id,
                )
                db.add(att)

            processed += 1

        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})

    batch.total_records = total
    batch.processed_records = processed
    batch.error_records = len(errors)
    batch.errors_detail = errors
    batch.status = "COMPLETADO" if not errors else ("PARCIAL" if processed > 0 else "ERROR")

    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="IMPORT_BATCH",
        entity_id=batch.id,
        action="CREATE",
        new_values={"type": "ASISTENCIA", "total": total, "processed": processed, "errors": len(errors)},
        company_id=company_id,
    )

    return {
        "batch_id": str(batch.id),
        "total_records": total,
        "processed": processed,
        "errors": errors,
        "status": batch.status,
    }


async def get_attendance_summary(
    db: AsyncSession,
    company_id: uuid.UUID,
    start_date: date,
    end_date: date,
    employee_id: uuid.UUID | None = None,
) -> list[dict]:
    """Get attendance summary for a date range."""
    query = (
        select(
            Attendance.employee_id,
            func.count().label("total_days"),
            func.count().filter(Attendance.status == "PRESENTE").label("present"),
            func.count().filter(Attendance.status == "FALTA").label("absent"),
            func.count().filter(Attendance.status == "TARDANZA").label("late"),
            func.sum(Attendance.tardiness_minutes).label("tardiness_minutes"),
            func.sum(Attendance.hours_worked).label("hours_worked"),
        )
        .where(
            Attendance.company_id == company_id,
            Attendance.attendance_date >= start_date,
            Attendance.attendance_date <= end_date,
        )
        .group_by(Attendance.employee_id)
    )

    if employee_id:
        query = query.where(Attendance.employee_id == employee_id)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result.all()]
