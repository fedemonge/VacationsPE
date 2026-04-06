"""
Initial seed data for payroll system.

Creates:
- Default company
- Cost centers
- System payroll concepts with rules
- Legal parameters (UIT, RMV, AFP rates, etc.)
- BBVA payment file layout
"""

import asyncio
import json
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory, engine
from app.models.company import Company
from app.models.concept import ConceptRule, PayrollConcept
from app.models.cost_center import CostCenter
from app.models.legal_param import LegalParameter
from app.models.payment_file import PaymentFileLayout
from app.services.bbva_service import BBVA_HABERES_V1_DETAIL_FIELDS, BBVA_HABERES_V1_HEADER_FIELDS


async def seed():
    async with async_session_factory() as db:
        # === COMPANY ===
        existing = await db.execute(select(Company).where(Company.ruc == "20100000001"))
        if existing.scalar_one_or_none():
            print("Seed: Company already exists, skipping...")
            return

        company = Company(
            ruc="20100000001",
            business_name="Woden Consulting S.A.C.",
            trade_name="Woden",
            address="Lima, Perú",
            country_code="PE",
            currency_code="PEN",
        )
        db.add(company)
        await db.flush()
        company_id = company.id
        print(f"Seed: Created company {company.business_name} (ID: {company_id})")

        # === COST CENTERS ===
        cost_centers = [
            ("ADM", "Administración"),
            ("VEN", "Ventas"),
            ("OPE", "Operaciones"),
            ("TEC", "Tecnología"),
            ("FIN", "Finanzas"),
            ("GER", "Gerencia General"),
        ]
        cc_map = {}
        for code, desc in cost_centers:
            cc = CostCenter(company_id=company_id, code=code, description=desc)
            db.add(cc)
            await db.flush()
            cc_map[code] = cc.id
        print(f"Seed: Created {len(cost_centers)} cost centers")

        # === PAYROLL CONCEPTS ===
        concepts_data = [
            # INGRESOS
            ("SUELDO_BASICO", "Sueldo Básico", "INGRESO", "REMUNERATIVO", True, True, True, True, True, True, True, 1),
            ("ASIG_FAMILIAR", "Asignación Familiar", "INGRESO", "REMUNERATIVO", True, True, True, True, True, True, True, 2),
            ("HE_25", "Horas Extra 25%", "INGRESO", "REMUNERATIVO", True, True, True, True, True, True, True, 3),
            ("HE_35", "Horas Extra 35%", "INGRESO", "REMUNERATIVO", True, True, True, True, True, True, True, 4),
            ("HE_100", "Horas Extra 100%", "INGRESO", "REMUNERATIVO", True, True, True, True, True, True, True, 5),
            ("COMISION", "Comisiones", "INGRESO", "REMUNERATIVO", True, True, True, True, True, True, True, 6),
            ("GRATIFICACION", "Gratificación", "INGRESO", "NO_REMUNERATIVO", True, False, True, False, False, False, True, 7),
            ("BONIF_EXTRA", "Bonificación Extraordinaria", "INGRESO", "NO_REMUNERATIVO", True, False, False, False, False, False, True, 8),
            # DESCUENTOS
            ("ONP", "ONP", "DESCUENTO", "OBLIGATORIO", True, False, False, False, False, False, True, 10),
            ("AFP_FONDO", "AFP - Fondo", "DESCUENTO", "OBLIGATORIO", True, False, False, False, False, False, True, 11),
            ("AFP_SEGURO", "AFP - Seguro", "DESCUENTO", "OBLIGATORIO", True, False, False, False, False, False, True, 12),
            ("AFP_COMISION", "AFP - Comisión", "DESCUENTO", "OBLIGATORIO", True, False, False, False, False, False, True, 13),
            ("RENTA_5TA", "Impuesto Renta 5ta Categoría", "DESCUENTO", "OBLIGATORIO", True, False, False, False, False, False, True, 14),
            ("DESC_TARDANZA", "Descuento por Tardanzas", "DESCUENTO", "OBLIGATORIO", True, False, False, False, False, False, True, 15),
            ("DESC_FALTAS", "Descuento por Faltas", "DESCUENTO", "OBLIGATORIO", True, False, False, False, False, False, True, 16),
            # APORTES EMPLEADOR
            ("ESSALUD", "EsSalud", "APORTE_EMPLEADOR", "OBLIGATORIO", True, False, False, False, False, False, True, 20),
            # INFORMATIVOS
            ("CTS", "CTS - Depósito Semestral", "INFORMATIVO", None, True, False, False, False, False, False, True, 30),
        ]

        for (code, name, category, subcat, affects_es, affects_pen, affects_5ta,
             affects_grat, affects_cts, affects_vac, is_system, order) in concepts_data:
            concept = PayrollConcept(
                company_id=company_id,
                code=code,
                name=name,
                category=category,
                subcategory=subcat,
                affects_essalud=affects_es,
                affects_pension=affects_pen,
                affects_5ta_cat=affects_5ta,
                affects_gratification=affects_grat,
                affects_cts=affects_cts,
                affects_vacation_pay=affects_vac,
                is_system=is_system,
                display_order=order,
            )
            db.add(concept)
        await db.flush()
        print(f"Seed: Created {len(concepts_data)} payroll concepts")

        # === LEGAL PARAMETERS ===
        legal_params = [
            # UIT
            ("UIT", Decimal("5150"), date(2024, 1, 1), date(2024, 12, 31), "UIT 2024", "DS 309-2023-EF"),
            ("UIT", Decimal("5350"), date(2025, 1, 1), date(2025, 12, 31), "UIT 2025", "DS 260-2024-EF"),
            ("UIT", Decimal("5350"), date(2026, 1, 1), None, "UIT 2026 (pendiente confirmar)", "Pendiente"),
            # RMV
            ("RMV", Decimal("1025"), date(2024, 1, 1), None, "Remuneración Mínima Vital", "DS 003-2022-TR"),
            # EsSalud
            ("ESSALUD_RATE", Decimal("9.0"), date(2024, 1, 1), None, "Tasa EsSalud 9%", "Ley 26790"),
            # ONP
            ("ONP_RATE", Decimal("13.0"), date(2024, 1, 1), None, "Tasa ONP 13%", "DL 19990"),
            # AFP Rates (2024 — actualizar periódicamente)
            ("AFP_FONDO_HABITAT", Decimal("10.0"), date(2024, 1, 1), None, "AFP Habitat - Fondo", "SBS"),
            ("AFP_SEGURO_HABITAT", Decimal("1.36"), date(2024, 1, 1), None, "AFP Habitat - Seguro", "SBS"),
            ("AFP_COMISION_HABITAT", Decimal("1.35"), date(2024, 1, 1), None, "AFP Habitat - Comisión flujo", "SBS"),
            ("AFP_FONDO_INTEGRA", Decimal("10.0"), date(2024, 1, 1), None, "AFP Integra - Fondo", "SBS"),
            ("AFP_SEGURO_INTEGRA", Decimal("1.36"), date(2024, 1, 1), None, "AFP Integra - Seguro", "SBS"),
            ("AFP_COMISION_INTEGRA", Decimal("1.55"), date(2024, 1, 1), None, "AFP Integra - Comisión flujo", "SBS"),
            ("AFP_FONDO_PRIMA", Decimal("10.0"), date(2024, 1, 1), None, "AFP Prima - Fondo", "SBS"),
            ("AFP_SEGURO_PRIMA", Decimal("1.36"), date(2024, 1, 1), None, "AFP Prima - Seguro", "SBS"),
            ("AFP_COMISION_PRIMA", Decimal("1.55"), date(2024, 1, 1), None, "AFP Prima - Comisión flujo", "SBS"),
            ("AFP_FONDO_PROFUTURO", Decimal("10.0"), date(2024, 1, 1), None, "AFP Profuturo - Fondo", "SBS"),
            ("AFP_SEGURO_PROFUTURO", Decimal("1.36"), date(2024, 1, 1), None, "AFP Profuturo - Seguro", "SBS"),
            ("AFP_COMISION_PROFUTURO", Decimal("1.69"), date(2024, 1, 1), None, "AFP Profuturo - Comisión flujo", "SBS"),
            # Gratificación bonus
            ("BONIF_EXTRA_RATE", Decimal("9.0"), date(2024, 1, 1), None, "Bonificación extraordinaria 9%", "Ley 30334"),
        ]

        for key, value, vfrom, vto, desc, ref in legal_params:
            param = LegalParameter(
                company_id=company_id,
                param_key=key,
                param_value=value,
                valid_from=vfrom,
                valid_to=vto,
                description=desc,
                legal_reference=ref,
            )
            db.add(param)
        await db.flush()
        print(f"Seed: Created {len(legal_params)} legal parameters")

        # === BBVA PAYMENT FILE LAYOUT ===
        layout = PaymentFileLayout(
            company_id=company_id,
            layout_code="BBVA_HABERES_V1",
            layout_name="BBVA Continental - Pago de Haberes V1 (pendiente confirmar formato exacto)",
            bank_code="BBVA",
            file_extension=".txt",
            encoding="UTF-8",
            line_separator="CRLF",
            header_fields=BBVA_HABERES_V1_HEADER_FIELDS,
            detail_fields=BBVA_HABERES_V1_DETAIL_FIELDS,
            footer_fields=[],
        )
        db.add(layout)
        await db.flush()
        print("Seed: Created BBVA_HABERES_V1 payment file layout")

        await db.commit()
        print("Seed: DONE")


if __name__ == "__main__":
    asyncio.run(seed())
