"""Tests for BBVA payment file generation."""

from app.services.bbva_service import _build_line, _format_field


class TestFormatField:
    def test_right_aligned_padded(self):
        field = {"name": "test", "length": 10, "pad": "0", "align": "right"}
        result = _format_field(field, "123")
        assert result == "0000000123"
        assert len(result) == 10

    def test_left_aligned_padded(self):
        field = {"name": "test", "length": 10, "pad": " ", "align": "left"}
        result = _format_field(field, "ABC")
        assert result == "ABC       "
        assert len(result) == 10

    def test_truncation(self):
        field = {"name": "test", "length": 5, "pad": " ", "align": "left"}
        result = _format_field(field, "ABCDEFGHIJ")
        assert result == "ABCDE"
        assert len(result) == 5

    def test_decimal_formatting(self):
        field = {"name": "amount", "length": 15, "pad": "0", "align": "right", "decimals": 2}
        result = _format_field(field, "1234.56")
        # 1234.56 * 100 = 123456
        assert result == "000000000123456"
        assert len(result) == 15

    def test_decimal_large_amount(self):
        field = {"name": "amount", "length": 15, "pad": "0", "align": "right", "decimals": 2}
        result = _format_field(field, "99999.99")
        assert result == "000000009999999"


class TestBuildLine:
    def test_build_detail_line(self):
        fields = [
            {"name": "type", "length": 2, "type": "fixed", "value": "02", "pad": "0", "align": "right"},
            {"name": "doc", "length": 8, "type": "field", "source": "document_number", "pad": "0", "align": "right"},
            {"name": "name", "length": 20, "type": "field", "source": "full_name", "pad": " ", "align": "left"},
            {"name": "amount", "length": 15, "type": "field", "source": "net_amount", "pad": "0", "align": "right", "decimals": 2},
        ]
        data = {
            "document_number": "12345678",
            "full_name": "Juan Pérez",
            "net_amount": "3500.50",
        }
        line = _build_line(fields, data)
        assert line.startswith("02")
        assert "12345678" in line
        assert len(line) == 2 + 8 + 20 + 15  # 45

    def test_missing_field_empty(self):
        fields = [
            {"name": "test", "length": 10, "type": "field", "source": "missing_field", "pad": " ", "align": "left"},
        ]
        line = _build_line(fields, {})
        assert line == "          "
        assert len(line) == 10
