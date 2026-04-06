"""Date utilities for payroll calculations."""

import calendar
from datetime import date


def days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def get_period_dates(year: int, month: int) -> tuple[date, date]:
    last_day = days_in_month(year, month)
    return date(year, month, 1), date(year, month, last_day)


def months_between(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + (end.month - start.month)


def is_gratification_month(month: int) -> bool:
    return month in (7, 12)


def is_cts_month(month: int) -> bool:
    return month in (5, 11)


def get_cts_semester(month: int) -> tuple[int, int]:
    """Returns the semester months for CTS calculation.

    CTS May: November (prior year) to April
    CTS November: May to October
    """
    if month == 5:
        return 11, 4  # Nov prior year to April
    if month == 11:
        return 5, 10  # May to October
    raise ValueError(f"Month {month} is not a CTS deposit month")


def get_gratification_semester(month: int) -> tuple[int, int]:
    """Returns the semester months for gratification calculation.

    Gratificación Julio: January to June
    Gratificación Diciembre: July to December
    """
    if month == 7:
        return 1, 6
    if month == 12:
        return 7, 12
    raise ValueError(f"Month {month} is not a gratification month")
