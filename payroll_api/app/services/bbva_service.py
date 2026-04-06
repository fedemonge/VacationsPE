"""
BBVA payment file generation service.

Layout configurable via payment_file_layout table.
Default: BBVA_HABERES_V1 — pendiente de confirmar formato exacto.
"""

import hashlib
import logging
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.employee import PayrollEmployee
from app.models.payment_file import PaymentFile, PaymentFileLayout
from app.models.payroll_detail import PayrollDetail
from app.models.period import PayrollPeriod
from app.services import audit_service

logger = logging.getLogger(__name__)

# Default BBVA layout definition — PENDIENTE DE CONFIRMAR con BBVA
BBVA_HABERES_V1_DETAIL_FIELDS = [
    {"name": "tipo_registro", "length": 2, "type": "fixed", "value": "02", "pad": "0", "align": "right"},
    {"name": "tipo_documento", "length": 2, "type": "field", "source": "document_type_code", "pad": "0", "align": "right"},
    {"name": "numero_documento", "length": 15, "type": "field", "source": "document_number", "pad": " ", "align": "left"},
    {"name": "apellido_paterno", "length": 40, "type": "field", "source": "paternal_surname", "pad": " ", "align": "left"},
    {"name": "apellido_materno", "length": 40, "type": "field", "source": "maternal_surname", "pad": " ", "align": "left"},
    {"name": "nombres", "length": 40, "type": "field", "source": "first_name", "pad": " ", "align": "left"},
    {"name": "tipo_cuenta", "length": 1, "type": "fixed", "value": "A", "pad": " ", "align": "left"},  # A=Ahorros, C=Corriente
    {"name": "moneda", "length": 4, "type": "fixed", "value": "0001", "pad": "0", "align": "right"},  # 0001=Soles
    {"name": "numero_cuenta", "length": 18, "type": "field", "source": "bank_account", "pad": "0", "align": "right"},
    {"name": "importe", "length": 15, "type": "field", "source": "net_amount", "pad": "0", "align": "right", "decimals": 2},
    {"name": "referencia", "length": 40, "type": "field", "source": "reference", "pad": " ", "align": "left"},
]

BBVA_HABERES_V1_HEADER_FIELDS = [
    {"name": "tipo_registro", "length": 2, "type": "fixed", "value": "01", "pad": "0", "align": "right"},
    {"name": "ruc_empresa", "length": 11, "type": "field", "source": "company_ruc", "pad": "0", "align": "right"},
    {"name": "fecha_pago", "length": 8, "type": "field", "source": "payment_date", "pad": "0", "align": "right", "format": "YYYYMMDD"},
    {"name": "tipo_pago", "length": 2, "type": "fixed", "value": "01", "pad": "0", "align": "right"},  # 01=Haberes
    {"name": "total_registros", "length": 6, "type": "field", "source": "total_records", "pad": "0", "align": "right"},
    {"name": "total_importe", "length": 15, "type": "field", "source": "total_amount", "pad": "0", "align": "right", "decimals": 2},
    {"name": "referencia", "length": 40, "type": "field", "source": "batch_reference", "pad": " ", "align": "left"},
]


def _format_field(field_def: dict, value: str) -> str:
    """Format a single field according to its definition."""
    length = field_def["length"]
    pad = field_def.get("pad", " ")
    align = field_def.get("align", "left")

    # Handle decimal amounts
    if field_def.get("decimals"):
        try:
            dec_val = Decimal(value)
            # Remove decimal point, multiply by 10^decimals
            factor = 10 ** field_def["decimals"]
            int_val = int(dec_val * factor)
            value = str(int_val)
        except Exception:
            pass

    # Truncate or pad
    value = value[:length]
    if align == "right":
        return value.rjust(length, pad)
    return value.ljust(length, pad)


def _build_line(fields: list[dict], data: dict) -> str:
    """Build a single line from field definitions and data."""
    parts = []
    for field_def in fields:
        if field_def["type"] == "fixed":
            value = field_def["value"]
        else:
            value = str(data.get(field_def["source"], ""))
        parts.append(_format_field(field_def, value))
    return "".join(parts)


async def generate_payment_file(
    db: AsyncSession,
    period_id: uuid.UUID,
    company_id: uuid.UUID,
    layout_code: str,
    ctx: AuditContext,
) -> PaymentFile:
    """Generate BBVA payment file for a period."""
    # Load period
    period = await db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Periodo no encontrado")
    if period.status not in ("CALCULADO", "CERRADO"):
        raise ValueError(f"Periodo debe estar CALCULADO o CERRADO, estado actual: {period.status}")

    # Load layout
    layout_result = await db.execute(
        select(PaymentFileLayout)
        .where(PaymentFileLayout.company_id == company_id, PaymentFileLayout.layout_code == layout_code)
    )
    layout = layout_result.scalar_one_or_none()
    if not layout:
        raise ValueError(f"Layout '{layout_code}' no encontrado. Ejecute el seed inicial.")

    # Load payroll details with employee info
    details_result = await db.execute(
        select(PayrollDetail, PayrollEmployee)
        .join(PayrollEmployee, PayrollDetail.employee_id == PayrollEmployee.id)
        .where(
            PayrollDetail.period_id == period_id,
            PayrollDetail.neto_a_pagar > 0,
        )
        .order_by(PayrollEmployee.employee_code)
    )

    lines = []
    total_amount = Decimal("0")
    total_records = 0
    validation_errors = []

    for detail, emp in details_result.all():
        # Validate
        if not emp.bank_account_number and not detail.bank_account_snapshot:
            validation_errors.append({
                "employee_code": emp.employee_code,
                "full_name": emp.full_name,
                "error": "Sin cuenta bancaria",
            })
            continue

        # Map document type
        doc_type_map = {"DNI": "01", "CE": "03", "PAS": "07"}
        doc_type_code = doc_type_map.get(emp.document_type, "01")

        account = detail.bank_account_snapshot or emp.bank_account_number or ""

        data = {
            "document_type_code": doc_type_code,
            "document_number": emp.document_number,
            "paternal_surname": emp.paternal_surname,
            "maternal_surname": emp.maternal_surname or "",
            "first_name": emp.first_name,
            "bank_account": account,
            "net_amount": str(detail.neto_a_pagar),
            "reference": f"HAB {period.period_label} {emp.employee_code}",
        }

        line = _build_line(layout.detail_fields, data)
        lines.append(line)
        total_amount += detail.neto_a_pagar
        total_records += 1

    if validation_errors:
        logger.warning(f"[BBVA] {len(validation_errors)} employees skipped due to validation errors")

    if total_records == 0:
        raise ValueError("No hay registros válidos para generar el archivo")

    # Build header
    from app.models.company import Company
    company = await db.get(Company, company_id)

    payment_date = period.payment_date or period.end_date
    header_data = {
        "company_ruc": company.ruc if company else "",
        "payment_date": payment_date.strftime("%Y%m%d"),
        "total_records": str(total_records),
        "total_amount": str(total_amount),
        "batch_reference": f"NOM-{period.period_label}",
    }
    header_line = _build_line(layout.header_fields, header_data)

    # Compose file
    separator = "\r\n" if layout.line_separator == "CRLF" else "\n"
    all_lines = [header_line] + lines
    file_content = separator.join(all_lines) + separator

    # Hash
    file_hash = hashlib.sha256(file_content.encode(layout.encoding)).hexdigest()
    file_name = f"BBVA_HABERES_{period.period_label}_{datetime.now().strftime('%Y%m%d%H%M%S')}{layout.file_extension}"

    # Save
    payment_file = PaymentFile(
        company_id=company_id,
        period_id=period_id,
        layout_id=layout.id,
        file_name=file_name,
        file_hash=file_hash,
        file_size_bytes=len(file_content.encode(layout.encoding)),
        total_records=total_records,
        total_amount=total_amount,
        file_content=file_content,
        generated_by=ctx.user_email,
        metadata_json={
            "validation_errors": validation_errors,
            "layout_version": layout.version,
        },
    )
    db.add(payment_file)
    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="PAYMENT_FILE",
        entity_id=payment_file.id,
        action="GENERATE",
        new_values={
            "file_name": file_name,
            "file_hash": file_hash,
            "total_records": total_records,
            "total_amount": str(total_amount),
        },
        company_id=company_id,
    )

    return payment_file


async def regenerate_payment_file(
    db: AsyncSession,
    file_id: uuid.UUID,
    ctx: AuditContext,
) -> PaymentFile:
    """Regenerate a payment file from a closed period — must produce identical hash."""
    original = await db.get(PaymentFile, file_id)
    if not original:
        raise ValueError("Archivo no encontrado")

    period = await db.get(PayrollPeriod, original.period_id)
    if not period or period.status != "CERRADO":
        raise ValueError("Solo se puede regenerar de un periodo cerrado")

    new_file = await generate_payment_file(
        db, original.period_id, original.company_id, "BBVA_HABERES_V1", ctx
    )

    if new_file.file_hash != original.file_hash:
        logger.warning(
            f"[BBVA] Hash mismatch on regeneration: original={original.file_hash}, new={new_file.file_hash}"
        )

    return new_file
