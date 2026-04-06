"""Tests for Peru tax calculations — 5ta categoría."""

from decimal import Decimal

from app.utils.peru_tax import calculate_annual_tax, calculate_monthly_retention


class TestAnnualTax:
    """Test progressive tax scale."""

    def test_below_7uit_no_tax(self):
        """Income below 7 UIT deduction should result in 0 tax."""
        uit = Decimal("5350")
        annual_gross = Decimal("35000")  # Less than 7 * 5350 = 37,450
        tax = calculate_annual_tax(annual_gross, uit)
        assert tax == Decimal("0")

    def test_first_bracket_8_percent(self):
        """Income in first bracket (up to 5 UIT above deduction)."""
        uit = Decimal("5350")
        deduction = uit * Decimal("7")  # 37,450
        # Gross that puts 10,000 in first bracket
        annual_gross = deduction + Decimal("10000")
        tax = calculate_annual_tax(annual_gross, uit)
        expected = Decimal("10000") * Decimal("0.08")  # 800
        assert tax == expected.quantize(Decimal("0.01"))

    def test_second_bracket_14_percent(self):
        """Income crossing into second bracket."""
        uit = Decimal("5350")
        deduction = uit * Decimal("7")  # 37,450
        first_bracket = uit * Decimal("5")  # 26,750
        # 10,000 in second bracket
        annual_gross = deduction + first_bracket + Decimal("10000")
        tax = calculate_annual_tax(annual_gross, uit)
        bracket_1_tax = first_bracket * Decimal("0.08")
        bracket_2_tax = Decimal("10000") * Decimal("0.14")
        expected = bracket_1_tax + bracket_2_tax
        assert tax == expected.quantize(Decimal("0.01"))

    def test_high_income(self):
        """High income touching multiple brackets."""
        uit = Decimal("5350")
        annual_gross = Decimal("500000")
        tax = calculate_annual_tax(annual_gross, uit)
        # Tax should be substantial but less than 30% of gross
        assert tax > Decimal("0")
        assert tax < annual_gross * Decimal("0.30")

    def test_zero_income(self):
        uit = Decimal("5350")
        tax = calculate_annual_tax(Decimal("0"), uit)
        assert tax == Decimal("0")


class TestMonthlyRetention:
    def test_january_retention(self):
        """January: annual tax / 12."""
        uit = Decimal("5350")
        annual_projected = Decimal("100000")
        retention = calculate_monthly_retention(
            current_month=1,
            annual_gross_projected=annual_projected,
            uit_value=uit,
            tax_already_retained=Decimal("0"),
        )
        annual_tax = calculate_annual_tax(annual_projected, uit)
        # Should be approximately annual_tax / 12
        assert retention > Decimal("0")
        assert retention <= annual_tax  # Can't retain more than total

    def test_december_full_remaining(self):
        """December: retain all remaining tax."""
        uit = Decimal("5350")
        annual_projected = Decimal("100000")
        annual_tax = calculate_annual_tax(annual_projected, uit)
        already_retained = annual_tax - Decimal("500")
        retention = calculate_monthly_retention(
            current_month=12,
            annual_gross_projected=annual_projected,
            uit_value=uit,
            tax_already_retained=already_retained,
        )
        assert retention == Decimal("500.00")

    def test_low_income_no_retention(self):
        """Low income worker should have no retention."""
        uit = Decimal("5350")
        annual_projected = Decimal("12300")  # 1025 * 12 = minimum wage annualized
        retention = calculate_monthly_retention(
            current_month=1,
            annual_gross_projected=annual_projected,
            uit_value=uit,
            tax_already_retained=Decimal("0"),
        )
        assert retention == Decimal("0")
