"""Tests for audit service serialization."""

import uuid
from datetime import date, datetime

from app.services.audit_service import _serialize


class TestAuditSerialization:
    def test_serialize_basic(self):
        result = _serialize({"name": "test", "value": 123})
        assert result == {"name": "test", "value": 123}

    def test_serialize_uuid(self):
        uid = uuid.uuid4()
        result = _serialize({"id": uid})
        assert result == {"id": str(uid)}

    def test_serialize_date(self):
        d = date(2026, 3, 1)
        result = _serialize({"date": d})
        assert result == {"date": "2026-03-01"}

    def test_serialize_datetime(self):
        dt = datetime(2026, 3, 1, 10, 30, 0)
        result = _serialize({"timestamp": dt})
        assert result["timestamp"].startswith("2026-03-01")

    def test_serialize_none_input(self):
        result = _serialize(None)
        assert result is None

    def test_serialize_mixed(self):
        uid = uuid.uuid4()
        result = _serialize({
            "id": uid,
            "name": "test",
            "date": date(2026, 1, 1),
            "count": 5,
        })
        assert result["id"] == str(uid)
        assert result["name"] == "test"
        assert result["date"] == "2026-01-01"
        assert result["count"] == 5
