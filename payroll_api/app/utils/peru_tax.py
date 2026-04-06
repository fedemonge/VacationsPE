"""
Cálculos tributarios Perú — Régimen General Privado.

Impuesto a la Renta de 5ta Categoría:
- Escala progresiva acumulativa anual sobre renta neta
- Renta neta = remuneración bruta anual - 7 UIT (deducción fija)
- Se retiene mensualmente la proyección / 12 (o meses restantes)

Referencia: Ley del Impuesto a la Renta, Art. 53 (TUO DS 179-2004-EF)
"""

from decimal import ROUND_HALF_UP, Decimal

# Escala progresiva 5ta categoría (en UITs)
# Hasta 5 UIT: 8%
# Más de 5 UIT hasta 20 UIT: 14%
# Más de 20 UIT hasta 35 UIT: 17%
# Más de 35 UIT hasta 45 UIT: 20%
# Más de 45 UIT: 30%

TAX_BRACKETS_UIT = [
    (Decimal("5"), Decimal("0.08")),
    (Decimal("15"), Decimal("0.14")),  # 20 - 5
    (Decimal("15"), Decimal("0.17")),  # 35 - 20
    (Decimal("10"), Decimal("0.20")),  # 45 - 35
    (None, Decimal("0.30")),           # Más de 45 UIT
]


def calculate_annual_tax(annual_gross: Decimal, uit_value: Decimal) -> Decimal:
    """Calcula el impuesto anual de 5ta categoría.

    Args:
        annual_gross: Remuneración bruta anual proyectada (incluye gratificaciones)
        uit_value: Valor de la UIT vigente

    Returns:
        Impuesto anual calculado
    """
    # Deducción de 7 UIT
    deduction = uit_value * Decimal("7")
    taxable_income = max(Decimal("0"), annual_gross - deduction)

    if taxable_income <= 0:
        return Decimal("0")

    total_tax = Decimal("0")
    remaining = taxable_income

    for bracket_uits, rate in TAX_BRACKETS_UIT:
        if bracket_uits is not None:
            bracket_amount = bracket_uits * uit_value
            taxable_in_bracket = min(remaining, bracket_amount)
        else:
            taxable_in_bracket = remaining

        tax_in_bracket = (taxable_in_bracket * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_tax += tax_in_bracket
        remaining -= taxable_in_bracket

        if remaining <= 0:
            break

    return total_tax


def calculate_monthly_retention(
    current_month: int,
    annual_gross_projected: Decimal,
    uit_value: Decimal,
    tax_already_retained: Decimal,
) -> Decimal:
    """Calcula la retención mensual de 5ta categoría.

    Procedimiento SUNAT:
    - Enero-Marzo: impuesto anual / 12
    - Abril-Julio: (impuesto anual - retenciones ene-mar) / 9... (simplificado)
    - Agosto: (impuesto anual - retenciones ene-jul) / 5
    - Sept-Nov: (impuesto anual - retenciones ene-ago) / 4, /3, /2
    - Diciembre: impuesto anual - retenciones ene-nov

    Simplificación implementada: impuesto anual / meses restantes
    Pendiente de validación legal para procedimiento exacto por tramos.

    Args:
        current_month: Mes actual (1-12)
        annual_gross_projected: Remuneración bruta anual proyectada
        uit_value: Valor UIT vigente
        tax_already_retained: Impuesto ya retenido en meses anteriores del año

    Returns:
        Retención del mes
    """
    annual_tax = calculate_annual_tax(annual_gross_projected, uit_value)
    remaining_tax = max(Decimal("0"), annual_tax - tax_already_retained)

    if current_month == 12:
        return remaining_tax

    remaining_months = 12 - current_month + 1
    if remaining_months <= 0:
        return remaining_tax

    monthly = (remaining_tax / Decimal(str(remaining_months))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return monthly


# AFP rates by provider (as of 2024 — must be updated via legal_parameter table)
AFP_RATES = {
    "HABITAT": {
        "fondo": Decimal("10.00"),
        "seguro": Decimal("1.36"),
        "comision_flujo": Decimal("1.35"),
    },
    "INTEGRA": {
        "fondo": Decimal("10.00"),
        "seguro": Decimal("1.36"),
        "comision_flujo": Decimal("1.55"),
    },
    "PRIMA": {
        "fondo": Decimal("10.00"),
        "seguro": Decimal("1.36"),
        "comision_flujo": Decimal("1.55"),
    },
    "PROFUTURO": {
        "fondo": Decimal("10.00"),
        "seguro": Decimal("1.36"),
        "comision_flujo": Decimal("1.69"),
    },
}

ONP_RATE = Decimal("13.00")  # 13% fijo
ESSALUD_RATE = Decimal("9.00")  # 9% empleador
GRATIFICATION_BONUS_RATE = Decimal("9.00")  # 9% bonificación extraordinaria sobre gratificación
