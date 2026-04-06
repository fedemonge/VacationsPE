"""
Individual concept calculators for Peru payroll.

Each function calculates a single payroll concept and returns the amount.
All amounts are in PEN (Soles) with 2 decimal precision.
"""

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from app.utils.peru_tax import (
    AFP_RATES,
    ESSALUD_RATE,
    GRATIFICATION_BONUS_RATE,
    ONP_RATE,
    calculate_monthly_retention,
)


@dataclass
class EmployeePayrollContext:
    """All data needed to calculate payroll for one employee in one period."""

    employee_id: str
    employee_code: str
    full_name: str

    # Contract
    base_salary: Decimal
    daily_hours: Decimal = Decimal("8")

    # Pension
    pension_system: str = "AFP"       # AFP or ONP
    pension_provider: str = "PRIMA"   # AFP provider name
    has_5ta_cat_exemption: bool = False
    has_dependents: bool = False

    # Period
    period_year: int = 2026
    period_month: int = 1
    days_worked: Decimal = Decimal("30")
    days_in_month: int = 30

    # Variables loaded from DB
    overtime_hours_25: Decimal = Decimal("0")
    overtime_hours_35: Decimal = Decimal("0")
    overtime_hours_100: Decimal = Decimal("0")
    total_commissions: Decimal = Decimal("0")
    total_tardiness_minutes: int = 0
    days_absent: int = 0

    # External parameters (loaded from legal_parameter table)
    uit_value: Decimal = Decimal("5350")  # UIT 2026 (pendiente confirmar)
    rmv_value: Decimal = Decimal("1025")  # RMV vigente

    # AFP rates (from legal_parameter or defaults)
    afp_fondo_rate: Decimal | None = None
    afp_seguro_rate: Decimal | None = None
    afp_comision_rate: Decimal | None = None

    # 5ta cat accumulated
    annual_gross_previous_months: Decimal = Decimal("0")
    tax_retained_previous_months: Decimal = Decimal("0")

    # Gratification/CTS context
    months_worked_in_semester: int = 6
    is_gratification_month: bool = False
    is_cts_month: bool = False

    # Additional variables (concept_code -> amount)
    additional_variables: dict[str, Decimal] = field(default_factory=dict)


@dataclass
class CalculatedLine:
    concept_code: str
    concept_name: str
    category: str  # INGRESO, DESCUENTO, APORTE_EMPLEADOR
    amount: Decimal
    calc_base: Decimal | None = None
    calc_rate: Decimal | None = None
    calc_formula: str | None = None


def _q(value: Decimal) -> Decimal:
    """Quantize to 2 decimal places."""
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calc_sueldo_basico(ctx: EmployeePayrollContext) -> CalculatedLine:
    """Sueldo básico proporcional a días trabajados."""
    if ctx.days_worked >= 30:
        amount = ctx.base_salary
    else:
        daily = ctx.base_salary / Decimal("30")
        amount = _q(daily * ctx.days_worked)
    return CalculatedLine(
        concept_code="SUELDO_BASICO",
        concept_name="Sueldo Básico",
        category="INGRESO",
        amount=amount,
        calc_base=ctx.base_salary,
        calc_formula=f"base_salary / 30 * {ctx.days_worked} days",
    )


def calc_asignacion_familiar(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """Asignación familiar: 10% de la RMV si tiene dependientes (Ley 25129)."""
    if not ctx.has_dependents:
        return None
    amount = _q(ctx.rmv_value * Decimal("0.10"))
    return CalculatedLine(
        concept_code="ASIG_FAMILIAR",
        concept_name="Asignación Familiar",
        category="INGRESO",
        amount=amount,
        calc_base=ctx.rmv_value,
        calc_rate=Decimal("10"),
        calc_formula="RMV * 10%",
    )


def calc_horas_extra_25(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """Horas extra 25% — primeras 2 horas diarias (DL 854 Art. 10)."""
    if ctx.overtime_hours_25 <= 0:
        return None
    hourly = ctx.base_salary / Decimal("240")
    rate = Decimal("1.25")
    amount = _q(hourly * rate * ctx.overtime_hours_25)
    return CalculatedLine(
        concept_code="HE_25",
        concept_name="Horas Extra 25%",
        category="INGRESO",
        amount=amount,
        calc_base=hourly,
        calc_rate=Decimal("25"),
        calc_formula=f"hourly_rate({hourly}) * 1.25 * {ctx.overtime_hours_25}h",
    )


def calc_horas_extra_35(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """Horas extra 35% — excedente de 2 horas diarias (DL 854 Art. 10)."""
    if ctx.overtime_hours_35 <= 0:
        return None
    hourly = ctx.base_salary / Decimal("240")
    rate = Decimal("1.35")
    amount = _q(hourly * rate * ctx.overtime_hours_35)
    return CalculatedLine(
        concept_code="HE_35",
        concept_name="Horas Extra 35%",
        category="INGRESO",
        amount=amount,
        calc_base=hourly,
        calc_rate=Decimal("35"),
        calc_formula=f"hourly_rate({hourly}) * 1.35 * {ctx.overtime_hours_35}h",
    )


def calc_horas_extra_100(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """Horas extra 100% — nocturnas o feriado."""
    if ctx.overtime_hours_100 <= 0:
        return None
    hourly = ctx.base_salary / Decimal("240")
    rate = Decimal("2.00")
    amount = _q(hourly * rate * ctx.overtime_hours_100)
    return CalculatedLine(
        concept_code="HE_100",
        concept_name="Horas Extra 100%",
        category="INGRESO",
        amount=amount,
        calc_base=hourly,
        calc_rate=Decimal("100"),
        calc_formula=f"hourly_rate({hourly}) * 2.00 * {ctx.overtime_hours_100}h",
    )


def calc_comisiones(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """Comisiones del periodo."""
    if ctx.total_commissions <= 0:
        return None
    return CalculatedLine(
        concept_code="COMISION",
        concept_name="Comisiones",
        category="INGRESO",
        amount=_q(ctx.total_commissions),
        calc_formula="sum(commissions)",
    )


def calc_descuento_tardanzas(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """Descuento por tardanzas proporcional."""
    if ctx.total_tardiness_minutes <= 0:
        return None
    daily = ctx.base_salary / Decimal("30")
    minute_rate = daily / (ctx.daily_hours * Decimal("60"))
    amount = _q(minute_rate * Decimal(str(ctx.total_tardiness_minutes)))
    return CalculatedLine(
        concept_code="DESC_TARDANZA",
        concept_name="Descuento por Tardanzas",
        category="DESCUENTO",
        amount=amount,
        calc_base=daily,
        calc_formula=f"daily_rate/({ctx.daily_hours}*60) * {ctx.total_tardiness_minutes}min",
    )


def calc_descuento_faltas(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """Descuento por faltas injustificadas."""
    if ctx.days_absent <= 0:
        return None
    daily = ctx.base_salary / Decimal("30")
    amount = _q(daily * Decimal(str(ctx.days_absent)))
    return CalculatedLine(
        concept_code="DESC_FALTAS",
        concept_name="Descuento por Faltas",
        category="DESCUENTO",
        amount=amount,
        calc_base=daily,
        calc_formula=f"daily_rate * {ctx.days_absent} days",
    )


def calc_gratificacion(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """Gratificación julio/diciembre (Ley 27735).
    1/6 por cada mes completo trabajado en el semestre.
    """
    if not ctx.is_gratification_month:
        return None
    proportion = Decimal(str(ctx.months_worked_in_semester)) / Decimal("6")
    amount = _q(ctx.base_salary * proportion)
    return CalculatedLine(
        concept_code="GRATIFICACION",
        concept_name="Gratificación",
        category="INGRESO",
        amount=amount,
        calc_base=ctx.base_salary,
        calc_rate=proportion * Decimal("100"),
        calc_formula=f"base_salary * ({ctx.months_worked_in_semester}/6)",
    )


def calc_bonif_extraordinaria(ctx: EmployeePayrollContext, gratification_amount: Decimal) -> CalculatedLine | None:
    """Bonificación extraordinaria 9% sobre gratificación (Ley 30334).
    Equivale al aporte EsSalud que no se paga sobre gratificación.
    """
    if gratification_amount <= 0:
        return None
    rate = GRATIFICATION_BONUS_RATE / Decimal("100")
    amount = _q(gratification_amount * rate)
    return CalculatedLine(
        concept_code="BONIF_EXTRA",
        concept_name="Bonificación Extraordinaria",
        category="INGRESO",
        amount=amount,
        calc_base=gratification_amount,
        calc_rate=GRATIFICATION_BONUS_RATE,
        calc_formula="gratificacion * 9%",
    )


def calc_cts(ctx: EmployeePayrollContext) -> CalculatedLine | None:
    """CTS mayo/noviembre (DL 650).
    (remuneración computable + 1/6 gratificación) / 12 * meses del semestre.
    La CTS se deposita, no se descuenta de la planilla regular.
    Se muestra como INFORMATIVO.
    """
    if not ctx.is_cts_month:
        return None
    grat_sexto = ctx.base_salary / Decimal("6")
    computable = ctx.base_salary + grat_sexto
    monthly = computable / Decimal("12")
    amount = _q(monthly * Decimal(str(ctx.months_worked_in_semester)))
    return CalculatedLine(
        concept_code="CTS",
        concept_name="CTS - Depósito Semestral",
        category="INFORMATIVO",
        amount=amount,
        calc_base=computable,
        calc_formula=f"(salary + salary/6) / 12 * {ctx.months_worked_in_semester} months",
    )


def calc_essalud(ctx: EmployeePayrollContext, base_remunerativa: Decimal) -> CalculatedLine:
    """EsSalud 9% — aporte del empleador (Ley 26790)."""
    rate = ESSALUD_RATE / Decimal("100")
    amount = _q(base_remunerativa * rate)
    return CalculatedLine(
        concept_code="ESSALUD",
        concept_name="EsSalud",
        category="APORTE_EMPLEADOR",
        amount=amount,
        calc_base=base_remunerativa,
        calc_rate=ESSALUD_RATE,
        calc_formula="base_remunerativa * 9%",
    )


def calc_onp(ctx: EmployeePayrollContext, base_remunerativa: Decimal) -> CalculatedLine | None:
    """ONP 13% — descuento al trabajador (DL 19990)."""
    if ctx.pension_system != "ONP":
        return None
    rate = ONP_RATE / Decimal("100")
    amount = _q(base_remunerativa * rate)
    return CalculatedLine(
        concept_code="ONP",
        concept_name="ONP",
        category="DESCUENTO",
        amount=amount,
        calc_base=base_remunerativa,
        calc_rate=ONP_RATE,
        calc_formula="base_remunerativa * 13%",
    )


def calc_afp(ctx: EmployeePayrollContext, base_remunerativa: Decimal) -> list[CalculatedLine]:
    """AFP — fondo + seguro + comisión (Ley 25897)."""
    if ctx.pension_system != "AFP":
        return []

    provider = ctx.pension_provider or "PRIMA"
    rates = AFP_RATES.get(provider.upper(), AFP_RATES["PRIMA"])

    fondo_rate = ctx.afp_fondo_rate or rates["fondo"]
    seguro_rate = ctx.afp_seguro_rate or rates["seguro"]
    comision_rate = ctx.afp_comision_rate or rates["comision_flujo"]

    lines = []

    # Fondo
    fondo_amount = _q(base_remunerativa * fondo_rate / Decimal("100"))
    lines.append(CalculatedLine(
        concept_code="AFP_FONDO",
        concept_name=f"AFP {provider} - Fondo",
        category="DESCUENTO",
        amount=fondo_amount,
        calc_base=base_remunerativa,
        calc_rate=fondo_rate,
        calc_formula=f"base_remunerativa * {fondo_rate}%",
    ))

    # Seguro
    seguro_amount = _q(base_remunerativa * seguro_rate / Decimal("100"))
    lines.append(CalculatedLine(
        concept_code="AFP_SEGURO",
        concept_name=f"AFP {provider} - Seguro",
        category="DESCUENTO",
        amount=seguro_amount,
        calc_base=base_remunerativa,
        calc_rate=seguro_rate,
        calc_formula=f"base_remunerativa * {seguro_rate}%",
    ))

    # Comisión
    comision_amount = _q(base_remunerativa * comision_rate / Decimal("100"))
    lines.append(CalculatedLine(
        concept_code="AFP_COMISION",
        concept_name=f"AFP {provider} - Comisión",
        category="DESCUENTO",
        amount=comision_amount,
        calc_base=base_remunerativa,
        calc_rate=comision_rate,
        calc_formula=f"base_remunerativa * {comision_rate}%",
    ))

    return lines


def calc_5ta_categoria(ctx: EmployeePayrollContext, monthly_gross: Decimal) -> CalculatedLine | None:
    """Impuesto a la renta 5ta categoría — retención mensual."""
    if ctx.has_5ta_cat_exemption:
        return None

    # Project annual gross: previous months actual + remaining months projected
    remaining_months = 12 - ctx.period_month + 1
    projected_annual = ctx.annual_gross_previous_months + (monthly_gross * Decimal(str(remaining_months)))

    # Add projected gratifications (2 per year)
    projected_annual += ctx.base_salary * Decimal("2")

    retention = calculate_monthly_retention(
        current_month=ctx.period_month,
        annual_gross_projected=projected_annual,
        uit_value=ctx.uit_value,
        tax_already_retained=ctx.tax_retained_previous_months,
    )

    if retention <= 0:
        return None

    return CalculatedLine(
        concept_code="RENTA_5TA",
        concept_name="Impuesto Renta 5ta Categoría",
        category="DESCUENTO",
        amount=retention,
        calc_base=projected_annual,
        calc_formula=f"projected_annual({projected_annual}) - 7UIT, progressive scale, month {ctx.period_month}",
    )


def calculate_all(ctx: EmployeePayrollContext) -> list[CalculatedLine]:
    """Execute all concept calculations for one employee in one period.

    Returns ordered list of calculated lines.
    """
    lines: list[CalculatedLine] = []

    # === INGRESOS ===
    sueldo = calc_sueldo_basico(ctx)
    lines.append(sueldo)

    asig_fam = calc_asignacion_familiar(ctx)
    if asig_fam:
        lines.append(asig_fam)

    he25 = calc_horas_extra_25(ctx)
    if he25:
        lines.append(he25)

    he35 = calc_horas_extra_35(ctx)
    if he35:
        lines.append(he35)

    he100 = calc_horas_extra_100(ctx)
    if he100:
        lines.append(he100)

    comisiones = calc_comisiones(ctx)
    if comisiones:
        lines.append(comisiones)

    # Gratificación
    grat = calc_gratificacion(ctx)
    if grat:
        lines.append(grat)
        bonif = calc_bonif_extraordinaria(ctx, grat.amount)
        if bonif:
            lines.append(bonif)

    # Additional variables (loaded from payroll_variable table)
    for code, amount in ctx.additional_variables.items():
        lines.append(CalculatedLine(
            concept_code=code,
            concept_name=f"Variable: {code}",
            category="INGRESO",
            amount=_q(amount),
            calc_formula="variable_manual",
        ))

    # === BASE REMUNERATIVA ===
    # Sum all INGRESO concepts that affect pension/essalud (remunerative concepts)
    # For simplicity: sueldo + asig_familiar + HE + comisiones (gratificación excluded from pension)
    base_remunerativa = sueldo.amount
    if asig_fam:
        base_remunerativa += asig_fam.amount
    if he25:
        base_remunerativa += he25.amount
    if he35:
        base_remunerativa += he35.amount
    if he100:
        base_remunerativa += he100.amount
    if comisiones:
        base_remunerativa += comisiones.amount

    # Monthly gross for 5ta cat (includes gratification if applicable)
    monthly_gross = base_remunerativa
    if grat:
        monthly_gross += grat.amount

    # === DESCUENTOS ===
    tardanzas = calc_descuento_tardanzas(ctx)
    if tardanzas:
        lines.append(tardanzas)

    faltas = calc_descuento_faltas(ctx)
    if faltas:
        lines.append(faltas)

    # Pension
    onp = calc_onp(ctx, base_remunerativa)
    if onp:
        lines.append(onp)

    afp_lines = calc_afp(ctx, base_remunerativa)
    lines.extend(afp_lines)

    # 5ta categoría
    renta = calc_5ta_categoria(ctx, monthly_gross)
    if renta:
        lines.append(renta)

    # === APORTES EMPLEADOR ===
    essalud = calc_essalud(ctx, base_remunerativa)
    lines.append(essalud)

    # === INFORMATIVO ===
    cts = calc_cts(ctx)
    if cts:
        lines.append(cts)

    return lines
