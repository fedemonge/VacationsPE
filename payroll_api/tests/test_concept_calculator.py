"""Tests for individual concept calculators."""

from decimal import Decimal

import pytest

from app.services.concept_calculator import (
    EmployeePayrollContext,
    calc_afp,
    calc_asignacion_familiar,
    calc_bonif_extraordinaria,
    calc_descuento_faltas,
    calc_descuento_tardanzas,
    calc_essalud,
    calc_gratificacion,
    calc_horas_extra_25,
    calc_horas_extra_35,
    calc_onp,
    calc_sueldo_basico,
    calculate_all,
)


class TestSueldoBasico:
    def test_full_month(self, sample_employee_context):
        result = calc_sueldo_basico(sample_employee_context)
        assert result.amount == Decimal("5000.00")
        assert result.category == "INGRESO"
        assert result.concept_code == "SUELDO_BASICO"

    def test_partial_month(self, sample_employee_context):
        sample_employee_context.days_worked = Decimal("20")
        result = calc_sueldo_basico(sample_employee_context)
        expected = Decimal("5000") / Decimal("30") * Decimal("20")
        assert result.amount == expected.quantize(Decimal("0.01"))


class TestAsignacionFamiliar:
    def test_with_dependents(self, sample_employee_context):
        result = calc_asignacion_familiar(sample_employee_context)
        assert result is not None
        expected = Decimal("1025") * Decimal("0.10")
        assert result.amount == expected.quantize(Decimal("0.01"))

    def test_without_dependents(self, sample_employee_context):
        sample_employee_context.has_dependents = False
        result = calc_asignacion_familiar(sample_employee_context)
        assert result is None


class TestHorasExtra:
    def test_he_25(self, sample_employee_context):
        result = calc_horas_extra_25(sample_employee_context)
        assert result is not None
        hourly = Decimal("5000") / Decimal("240")
        expected = hourly * Decimal("1.25") * Decimal("4")
        assert result.amount == expected.quantize(Decimal("0.01"))

    def test_he_35(self, sample_employee_context):
        result = calc_horas_extra_35(sample_employee_context)
        assert result is not None
        hourly = Decimal("5000") / Decimal("240")
        expected = hourly * Decimal("1.35") * Decimal("2")
        assert result.amount == expected.quantize(Decimal("0.01"))

    def test_no_overtime(self, sample_employee_context):
        sample_employee_context.overtime_hours_25 = Decimal("0")
        result = calc_horas_extra_25(sample_employee_context)
        assert result is None


class TestGratificacion:
    def test_full_semester(self, sample_gratification_context):
        result = calc_gratificacion(sample_gratification_context)
        assert result is not None
        assert result.amount == Decimal("5000.00")
        assert result.concept_code == "GRATIFICACION"

    def test_partial_semester(self, sample_gratification_context):
        sample_gratification_context.months_worked_in_semester = 3
        result = calc_gratificacion(sample_gratification_context)
        assert result is not None
        assert result.amount == Decimal("2500.00")

    def test_not_grat_month(self, sample_employee_context):
        result = calc_gratificacion(sample_employee_context)
        assert result is None


class TestBonifExtraordinaria:
    def test_bonif(self, sample_employee_context):
        result = calc_bonif_extraordinaria(sample_employee_context, Decimal("5000"))
        assert result is not None
        assert result.amount == Decimal("450.00")  # 9% of 5000

    def test_zero_grat(self, sample_employee_context):
        result = calc_bonif_extraordinaria(sample_employee_context, Decimal("0"))
        assert result is None


class TestONP:
    def test_onp_worker(self, sample_employee_context):
        sample_employee_context.pension_system = "ONP"
        base = Decimal("5000")
        result = calc_onp(sample_employee_context, base)
        assert result is not None
        assert result.amount == Decimal("650.00")  # 13%

    def test_afp_worker_no_onp(self, sample_employee_context):
        result = calc_onp(sample_employee_context, Decimal("5000"))
        assert result is None


class TestAFP:
    def test_afp_prima(self, sample_employee_context):
        base = Decimal("5000")
        lines = calc_afp(sample_employee_context, base)
        assert len(lines) == 3
        codes = [l.concept_code for l in lines]
        assert "AFP_FONDO" in codes
        assert "AFP_SEGURO" in codes
        assert "AFP_COMISION" in codes
        fondo = next(l for l in lines if l.concept_code == "AFP_FONDO")
        assert fondo.amount == Decimal("500.00")  # 10%

    def test_onp_worker_no_afp(self, sample_employee_context):
        sample_employee_context.pension_system = "ONP"
        lines = calc_afp(sample_employee_context, Decimal("5000"))
        assert len(lines) == 0


class TestEsSalud:
    def test_essalud(self, sample_employee_context):
        base = Decimal("5000")
        result = calc_essalud(sample_employee_context, base)
        assert result.amount == Decimal("450.00")  # 9%
        assert result.category == "APORTE_EMPLEADOR"


class TestDescuentos:
    def test_tardanzas(self, sample_employee_context):
        sample_employee_context.total_tardiness_minutes = 60
        result = calc_descuento_tardanzas(sample_employee_context)
        assert result is not None
        assert result.amount > 0

    def test_faltas(self, sample_employee_context):
        sample_employee_context.days_absent = 2
        result = calc_descuento_faltas(sample_employee_context)
        assert result is not None
        daily = Decimal("5000") / Decimal("30")
        expected = daily * Decimal("2")
        assert result.amount == expected.quantize(Decimal("0.01"))


class TestCalculateAll:
    def test_full_calculation(self, sample_employee_context):
        lines = calculate_all(sample_employee_context)
        assert len(lines) > 0

        # Verify we have ingresos and descuentos
        categories = {l.category for l in lines}
        assert "INGRESO" in categories
        assert "DESCUENTO" in categories
        assert "APORTE_EMPLEADOR" in categories

        # Verify sueldo is present
        codes = [l.concept_code for l in lines]
        assert "SUELDO_BASICO" in codes
        assert "ESSALUD" in codes

        # Verify totals make sense
        ingresos = sum(l.amount for l in lines if l.category == "INGRESO")
        descuentos = sum(l.amount for l in lines if l.category == "DESCUENTO")
        neto = ingresos - descuentos
        assert neto > 0  # Net pay should be positive
        assert ingresos > Decimal("5000")  # More than base salary (has HE + commissions)

    def test_minimum_wage_worker(self):
        ctx = EmployeePayrollContext(
            employee_id="test-min",
            employee_code="EMP-MIN",
            full_name="Trabajador Mínimo",
            base_salary=Decimal("1025.00"),
            pension_system="ONP",
            period_year=2026,
            period_month=1,
        )
        lines = calculate_all(ctx)
        assert len(lines) > 0
        sueldo = next(l for l in lines if l.concept_code == "SUELDO_BASICO")
        assert sueldo.amount == Decimal("1025.00")
        onp = next(l for l in lines if l.concept_code == "ONP")
        assert onp.amount == Decimal("133.25")  # 13% of 1025
