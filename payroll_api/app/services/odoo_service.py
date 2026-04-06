"""
Odoo integration service — outbox pattern with idempotency.

Supports:
1. CSV export for manual import into Odoo
2. API integration (XML-RPC) for automated posting — configurable
"""

import csv
import io
import logging
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuditContext
from app.models.cost_center import CostCenter
from app.models.odoo_outbox import OdooOutbox
from app.models.payroll_detail import PayrollDetail, PayrollDetailLine
from app.models.period import PayrollPeriod
from app.services import audit_service

logger = logging.getLogger(__name__)


async def generate_accounting_entry(
    db: AsyncSession,
    period_id: uuid.UUID,
    company_id: uuid.UUID,
    ctx: AuditContext,
) -> OdooOutbox:
    """Generate accounting journal entry for a payroll period and queue in outbox."""
    period = await db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Periodo no encontrado")
    if period.status not in ("CALCULADO", "CERRADO"):
        raise ValueError("Periodo debe estar CALCULADO o CERRADO")

    idempotency_key = f"NOM-{period.period_label}-{period.period_type}"

    # Check for existing
    existing = await db.execute(
        select(OdooOutbox).where(OdooOutbox.idempotency_key == idempotency_key)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Ya existe un asiento para {idempotency_key}")

    # Build journal entry lines grouped by cost center and concept category
    lines_result = await db.execute(
        select(
            CostCenter.code.label("cc_code"),
            CostCenter.description.label("cc_desc"),
            PayrollDetailLine.category,
            PayrollDetailLine.concept_code,
            PayrollDetailLine.concept_name,
            func.sum(PayrollDetailLine.amount).label("total"),
        )
        .join(PayrollDetail, PayrollDetailLine.detail_id == PayrollDetail.id)
        .join(CostCenter, PayrollDetail.cost_center_id == CostCenter.id)
        .where(PayrollDetail.period_id == period_id)
        .group_by(CostCenter.code, CostCenter.description, PayrollDetailLine.category, PayrollDetailLine.concept_code, PayrollDetailLine.concept_name)
    )

    journal_lines = []
    for row in lines_result.all():
        journal_lines.append({
            "cost_center": row.cc_code,
            "cost_center_desc": row.cc_desc,
            "category": row.category,
            "concept_code": row.concept_code,
            "concept_name": row.concept_name,
            "amount": str(row.total),
        })

    # Build net payment total by cost center
    net_result = await db.execute(
        select(
            CostCenter.code.label("cc_code"),
            func.sum(PayrollDetail.neto_a_pagar).label("total_neto"),
        )
        .join(CostCenter, PayrollDetail.cost_center_id == CostCenter.id)
        .where(PayrollDetail.period_id == period_id)
        .group_by(CostCenter.code)
    )
    net_lines = [{"cost_center": r.cc_code, "total_neto": str(r.total_neto)} for r in net_result.all()]

    payload = {
        "journal": "NOM",
        "date": period.end_date.isoformat(),
        "ref": idempotency_key,
        "period_label": period.period_label,
        "period_type": period.period_type,
        "detail_lines": journal_lines,
        "net_payment_lines": net_lines,
    }

    outbox = OdooOutbox(
        company_id=company_id,
        period_id=period_id,
        event_type="ASIENTO_NOMINA",
        payload=payload,
        idempotency_key=idempotency_key,
    )
    db.add(outbox)
    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="ODOO_OUTBOX",
        entity_id=outbox.id,
        action="CREATE",
        new_values={"idempotency_key": idempotency_key, "event_type": "ASIENTO_NOMINA"},
        company_id=company_id,
    )

    return outbox


async def export_csv_for_odoo(
    db: AsyncSession,
    period_id: uuid.UUID,
) -> str:
    """Export CSV file formatted for Odoo import as journal entry.

    Columns: journal, date, ref, account_code, partner, label, debit, credit, analytic_account
    """
    period = await db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Periodo no encontrado")

    # Simplified account mapping — should be configurable
    ACCOUNT_MAP = {
        "INGRESO": {"account": "6211", "side": "debit", "label": "Gastos de personal"},
        "DESCUENTO": {"account": "4017", "side": "credit", "label": "Tributos por pagar"},
        "APORTE_EMPLEADOR": {"account": "6271", "side": "debit", "label": "Aporte empleador"},
        "NETO": {"account": "4111", "side": "credit", "label": "Remuneraciones por pagar"},
    }

    lines_result = await db.execute(
        select(
            CostCenter.code.label("cc_code"),
            PayrollDetailLine.category,
            PayrollDetailLine.concept_code,
            PayrollDetailLine.concept_name,
            func.sum(PayrollDetailLine.amount).label("total"),
        )
        .join(PayrollDetail, PayrollDetailLine.detail_id == PayrollDetail.id)
        .join(CostCenter, PayrollDetail.cost_center_id == CostCenter.id)
        .where(PayrollDetail.period_id == period_id)
        .group_by(CostCenter.code, PayrollDetailLine.category, PayrollDetailLine.concept_code, PayrollDetailLine.concept_name)
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["journal", "date", "ref", "account_code", "partner", "name", "debit", "credit", "analytic_account"])

    ref = f"NOM-{period.period_label}"

    for row in lines_result.all():
        mapping = ACCOUNT_MAP.get(row.category, ACCOUNT_MAP["INGRESO"])
        debit = str(row.total) if mapping["side"] == "debit" else "0"
        credit = str(row.total) if mapping["side"] == "credit" else "0"

        writer.writerow([
            "NOM",
            period.end_date.isoformat(),
            ref,
            mapping["account"],
            "",
            f"{row.concept_name} - CC {row.cc_code}",
            debit,
            credit,
            row.cc_code,
        ])

    # Net payment line per cost center
    net_result = await db.execute(
        select(
            CostCenter.code.label("cc_code"),
            func.sum(PayrollDetail.neto_a_pagar).label("total_neto"),
        )
        .join(CostCenter, PayrollDetail.cost_center_id == CostCenter.id)
        .where(PayrollDetail.period_id == period_id)
        .group_by(CostCenter.code)
    )
    for row in net_result.all():
        writer.writerow([
            "NOM",
            period.end_date.isoformat(),
            ref,
            "4111",
            "",
            f"Neto por pagar - CC {row.cc_code}",
            "0",
            str(row.total_neto),
            row.cc_code,
        ])

    return output.getvalue()


async def retry_outbox(
    db: AsyncSession,
    outbox_id: uuid.UUID,
    ctx: AuditContext,
) -> OdooOutbox:
    """Retry sending a failed outbox entry."""
    entry = await db.get(OdooOutbox, outbox_id)
    if not entry:
        raise ValueError("Entrada de outbox no encontrada")
    if entry.status not in ("ERROR", "REINTENTANDO"):
        raise ValueError(f"Solo se puede reintentar entradas en ERROR, estado actual: {entry.status}")

    entry.status = "PENDIENTE"
    entry.attempts = 0
    await db.flush()
    return entry
