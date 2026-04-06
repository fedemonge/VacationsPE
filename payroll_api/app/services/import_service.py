"""Generic CSV import service for overtime and commissions."""

import csv
import io
import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.commission import Commission
from app.models.employee import PayrollEmployee
from app.models.import_batch import ImportBatch
from app.models.overtime import Overtime
from app.services import audit_service


async def import_overtime_csv(
    db: AsyncSession,
    company_id: uuid.UUID,
    file_content: str,
    file_name: str,
    ctx: AuditContext,
) -> dict:
    """Import overtime records from CSV.

    Expected columns: employee_code, date (YYYY-MM-DD), hours_25, hours_35, hours_100
    """
    batch = ImportBatch(
        company_id=company_id,
        import_type="HORAS_EXTRA",
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
            ot_date_str = row.get("date", "").strip()

            if not emp_code or not ot_date_str:
                errors.append({"row": row_num, "error": "employee_code y date son requeridos"})
                continue

            emp_result = await db.execute(
                select(PayrollEmployee.id)
                .where(PayrollEmployee.company_id == company_id, PayrollEmployee.employee_code == emp_code)
            )
            emp_id = emp_result.scalar_one_or_none()
            if not emp_id:
                errors.append({"row": row_num, "error": f"Empleado {emp_code} no encontrado"})
                continue

            from datetime import date
            ot_date = date.fromisoformat(ot_date_str)
            h25 = Decimal(row.get("hours_25", "0") or "0")
            h35 = Decimal(row.get("hours_35", "0") or "0")
            h100 = Decimal(row.get("hours_100", "0") or "0")

            existing = await db.execute(
                select(Overtime).where(
                    Overtime.company_id == company_id,
                    Overtime.employee_id == emp_id,
                    Overtime.overtime_date == ot_date,
                )
            )
            ot = existing.scalar_one_or_none()
            if ot:
                ot.hours_25 = h25
                ot.hours_35 = h35
                ot.hours_100 = h100
                ot.import_batch_id = batch.id
            else:
                ot = Overtime(
                    company_id=company_id,
                    employee_id=emp_id,
                    overtime_date=ot_date,
                    hours_25=h25,
                    hours_35=h35,
                    hours_100=h100,
                    source="CSV_IMPORT",
                    import_batch_id=batch.id,
                )
                db.add(ot)

            processed += 1
        except (InvalidOperation, ValueError) as e:
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
        new_values={"type": "HORAS_EXTRA", "total": total, "processed": processed, "errors": len(errors)},
        company_id=company_id,
    )

    return {"batch_id": str(batch.id), "total_records": total, "processed": processed, "errors": errors, "status": batch.status}


async def import_commissions_csv(
    db: AsyncSession,
    company_id: uuid.UUID,
    file_content: str,
    file_name: str,
    ctx: AuditContext,
) -> dict:
    """Import commission records from CSV.

    Expected columns: employee_code, period_year, period_month, amount, description
    """
    batch = ImportBatch(
        company_id=company_id,
        import_type="COMISIONES",
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
            year = int(row.get("period_year", "0"))
            month = int(row.get("period_month", "0"))
            amount = Decimal(row.get("amount", "0"))
            desc = row.get("description", "").strip()

            if not emp_code or not year or not month:
                errors.append({"row": row_num, "error": "employee_code, period_year y period_month requeridos"})
                continue

            emp_result = await db.execute(
                select(PayrollEmployee.id)
                .where(PayrollEmployee.company_id == company_id, PayrollEmployee.employee_code == emp_code)
            )
            emp_id = emp_result.scalar_one_or_none()
            if not emp_id:
                errors.append({"row": row_num, "error": f"Empleado {emp_code} no encontrado"})
                continue

            comm = Commission(
                company_id=company_id,
                employee_id=emp_id,
                period_year=year,
                period_month=month,
                amount=amount,
                description=desc,
                source="CSV_IMPORT",
                import_batch_id=batch.id,
            )
            db.add(comm)
            processed += 1
        except (InvalidOperation, ValueError) as e:
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
        new_values={"type": "COMISIONES", "total": total, "processed": processed, "errors": len(errors)},
        company_id=company_id,
    )

    return {"batch_id": str(batch.id), "total_records": total, "processed": processed, "errors": errors, "status": batch.status}
