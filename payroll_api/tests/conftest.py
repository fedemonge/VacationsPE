"""Test configuration and fixtures."""

import pytest


@pytest.fixture
def sample_employee_context():
    """Create a sample EmployeePayrollContext for testing."""
    from decimal import Decimal
    from app.services.concept_calculator import EmployeePayrollContext

    return EmployeePayrollContext(
        employee_id="test-001",
        employee_code="EMP-001",
        full_name="Juan Pérez García",
        base_salary=Decimal("5000.00"),
        daily_hours=Decimal("8"),
        pension_system="AFP",
        pension_provider="PRIMA",
        has_5ta_cat_exemption=False,
        has_dependents=True,
        period_year=2026,
        period_month=3,
        days_worked=Decimal("30"),
        overtime_hours_25=Decimal("4"),
        overtime_hours_35=Decimal("2"),
        overtime_hours_100=Decimal("0"),
        total_commissions=Decimal("1000.00"),
        total_tardiness_minutes=30,
        days_absent=0,
        uit_value=Decimal("5350"),
        rmv_value=Decimal("1025"),
        annual_gross_previous_months=Decimal("12000"),
        tax_retained_previous_months=Decimal("200"),
        months_worked_in_semester=6,
        is_gratification_month=False,
        is_cts_month=False,
    )


@pytest.fixture
def sample_gratification_context(sample_employee_context):
    """Context for July gratification month."""
    ctx = sample_employee_context
    ctx.period_month = 7
    ctx.is_gratification_month = True
    ctx.months_worked_in_semester = 6
    return ctx
