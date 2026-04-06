"""Payslip (boleta de pago) generation service — PDF."""

import io
import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import AuditContext
from app.models.company import Company
from app.models.contract import EmploymentContract
from app.models.cost_center import CostCenter
from app.models.employee import PayrollEmployee
from app.models.payroll_detail import PayrollDetail, PayrollDetailLine
from app.models.payslip import Payslip
from app.models.period import PayrollPeriod
from app.services import audit_service

logger = logging.getLogger(__name__)


async def generate_payslips(
    db: AsyncSession,
    period_id: uuid.UUID,
    company_id: uuid.UUID,
    ctx: AuditContext,
) -> dict:
    """Generate PDF payslips for all employees in a period."""
    period = await db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Periodo no encontrado")
    if period.status not in ("CALCULADO", "CERRADO"):
        raise ValueError("Periodo debe estar CALCULADO o CERRADO")

    company = await db.get(Company, company_id)

    details_result = await db.execute(
        select(PayrollDetail)
        .options(selectinload(PayrollDetail.lines))
        .where(PayrollDetail.period_id == period_id)
    )

    generated = 0
    for detail in details_result.scalars().all():
        emp = await db.get(PayrollEmployee, detail.employee_id)
        contract = await db.get(EmploymentContract, detail.contract_id)
        cc = await db.get(CostCenter, detail.cost_center_id)

        pdf_bytes = _generate_payslip_pdf(
            company=company,
            employee=emp,
            contract=contract,
            cost_center=cc,
            period=period,
            detail=detail,
        )

        import hashlib
        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()

        # Upsert payslip record
        existing = await db.execute(
            select(Payslip).where(
                Payslip.period_id == period_id,
                Payslip.employee_id == detail.employee_id,
            )
        )
        payslip = existing.scalar_one_or_none()
        if payslip:
            payslip.pdf_hash = pdf_hash
            payslip.detail_id = detail.id
        else:
            payslip = Payslip(
                company_id=company_id,
                period_id=period_id,
                employee_id=detail.employee_id,
                detail_id=detail.id,
                pdf_hash=pdf_hash,
            )
            db.add(payslip)

        # TODO: Upload to S3 and set pdf_s3_key
        # For now, store path locally
        generated += 1

    await db.flush()

    await audit_service.log_event(
        db, ctx,
        entity_type="PAYSLIP",
        entity_id=period_id,
        action="GENERATE",
        new_values={"period_id": str(period_id), "generated": generated},
        company_id=company_id,
    )

    return {"period_id": str(period_id), "payslips_generated": generated}


def _generate_payslip_pdf(
    company,
    employee,
    contract,
    cost_center,
    period,
    detail,
) -> bytes:
    """Generate a single payslip PDF using ReportLab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    elements = []

    # Header
    title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=14, alignment=1)
    elements.append(Paragraph(f"BOLETA DE PAGO", title_style))
    elements.append(Spacer(1, 5*mm))

    # Company info
    company_name = company.business_name if company else "Empresa"
    company_ruc = company.ruc if company else ""
    elements.append(Paragraph(f"<b>{company_name}</b> — RUC: {company_ruc}", styles["Normal"]))
    elements.append(Paragraph(f"Periodo: {period.period_label} ({period.period_type})", styles["Normal"]))
    elements.append(Spacer(1, 5*mm))

    # Employee info
    emp_data = [
        ["Código:", employee.employee_code, "Documento:", f"{employee.document_type} {employee.document_number}"],
        ["Nombre:", employee.full_name, "Cargo:", contract.position_title or ""],
        ["F. Ingreso:", str(employee.hire_date), "C. Costo:", f"{cost_center.code} - {cost_center.description}" if cost_center else ""],
        ["Sueldo Base:", f"S/ {detail.base_salary:,.2f}", "Días Trab.:", str(detail.days_worked)],
    ]
    emp_table = Table(emp_data, colWidths=[80, 150, 80, 150])
    emp_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(emp_table)
    elements.append(Spacer(1, 5*mm))

    # Detail lines
    ingresos = [l for l in detail.lines if l.category == "INGRESO"]
    descuentos = [l for l in detail.lines if l.category == "DESCUENTO"]
    aportes = [l for l in detail.lines if l.category == "APORTE_EMPLEADOR"]

    line_data = [["CONCEPTO", "INGRESOS", "DESCUENTOS"]]

    max_rows = max(len(ingresos), len(descuentos))
    for i in range(max_rows):
        ing_name = ingresos[i].concept_name if i < len(ingresos) else ""
        ing_amount = f"S/ {ingresos[i].amount:,.2f}" if i < len(ingresos) else ""
        desc_name = descuentos[i].concept_name if i < len(descuentos) else ""
        desc_amount = f"S/ {descuentos[i].amount:,.2f}" if i < len(descuentos) else ""
        line_data.append([ing_name, ing_amount, f"{desc_name}  {desc_amount}".strip()])

    # Totals
    line_data.append(["", "", ""])
    line_data.append(["TOTAL INGRESOS", f"S/ {detail.total_ingresos:,.2f}", ""])
    line_data.append(["TOTAL DESCUENTOS", "", f"S/ {detail.total_descuentos:,.2f}"])
    line_data.append(["", "", ""])
    line_data.append(["NETO A PAGAR", f"S/ {detail.neto_a_pagar:,.2f}", ""])

    detail_table = Table(line_data, colWidths=[200, 120, 140])
    detail_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.black),
        ("LINEABOVE", (0, -2), (-1, -2), 1, colors.black),
        ("FONTNAME", (0, -2), (-1, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(detail_table)
    elements.append(Spacer(1, 5*mm))

    # Aportes empleador
    if aportes:
        elements.append(Paragraph("<b>Aportes del Empleador:</b>", styles["Normal"]))
        for ap in aportes:
            elements.append(Paragraph(f"  {ap.concept_name}: S/ {ap.amount:,.2f}", styles["Normal"]))

    doc.build(elements)
    return buffer.getvalue()
