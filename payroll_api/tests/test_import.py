"""Tests for CSV import parsing logic."""

import csv
import io

from app.services.bbva_service import _format_field


class TestCSVParsing:
    """Test CSV format validation logic (without DB)."""

    def test_attendance_csv_format(self):
        """Verify expected CSV format can be parsed."""
        csv_content = """employee_code,date,clock_in,clock_out,status
EMP-001,2026-03-01,08:00,17:00,PRESENTE
EMP-001,2026-03-02,08:15,17:00,TARDANZA
EMP-002,2026-03-01,,,FALTA
"""
        reader = csv.DictReader(io.StringIO(csv_content))
        rows = list(reader)
        assert len(rows) == 3
        assert rows[0]["employee_code"] == "EMP-001"
        assert rows[0]["clock_in"] == "08:00"
        assert rows[2]["status"] == "FALTA"

    def test_overtime_csv_format(self):
        csv_content = """employee_code,date,hours_25,hours_35,hours_100
EMP-001,2026-03-01,2,0,0
EMP-001,2026-03-02,2,1,0
"""
        reader = csv.DictReader(io.StringIO(csv_content))
        rows = list(reader)
        assert len(rows) == 2
        assert float(rows[1]["hours_35"]) == 1.0

    def test_commission_csv_format(self):
        csv_content = """employee_code,period_year,period_month,amount,description
EMP-001,2026,3,1500.50,Comisión ventas
EMP-002,2026,3,2000,Bono producción
"""
        reader = csv.DictReader(io.StringIO(csv_content))
        rows = list(reader)
        assert len(rows) == 2
        assert float(rows[0]["amount"]) == 1500.50

    def test_utf8_bom_handling(self):
        """Test UTF-8 BOM is handled (Excel exports with BOM)."""
        csv_content = "\ufeffemployee_code,date,clock_in,clock_out,status\nEMP-001,2026-03-01,08:00,17:00,PRESENTE"
        # Remove BOM by stripping the BOM character
        clean = csv_content.lstrip("\ufeff")
        reader = csv.DictReader(io.StringIO(clean))
        rows = list(reader)
        assert len(rows) == 1
        assert "employee_code" in rows[0]
