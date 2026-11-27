from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services import report_feature_service
from app.utils.uuid import utcnow
from tests.conftest import (
    create_academic_data,
    create_session_record,
    create_user,
    login_headers,
    start_session_via_api,
)


def _create_attendance(client: TestClient, db_session: Session) -> dict[str, object]:
    data = create_academic_data(db_session)
    create_user(db_session, email="feature.admin@university.edu", password="Admin123!", role="admin")
    session = create_session_record(db_session, data)
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    admin_headers = login_headers(client, "feature.admin@university.edu", "Admin123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    token = start_session_via_api(client, session.id, professor_headers)
    checkin = client.post(
        "/api/v1/attendance/qr",
        headers=student_headers,
        json={"token": token, "latitude": 37.7749, "longitude": -122.4194, "accuracy": 5},
    )
    assert checkin.status_code == 201, checkin.text
    return {
        "data": data,
        "session": session,
        "professor_headers": professor_headers,
        "admin_headers": admin_headers,
        "student_headers": student_headers,
    }


def test_report_presets_are_owner_scoped(client: TestClient, db_session: Session) -> None:
    _create_attendance(client, db_session)
    admin_headers = login_headers(client, "feature.admin@university.edu", "Admin123!")
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")

    created = client.post(
        "/api/v1/reports/presets",
        headers=admin_headers,
        json={
            "name": "Present records",
            "report_type": "records",
            "filters": {"status": "present"},
            "is_default": True,
        },
    )
    assert created.status_code == 201, created.text
    preset = created.json()
    assert preset["filters"] == {"status": "present"}
    assert preset["is_default"] is True

    duplicate = client.post(
        "/api/v1/reports/presets",
        headers=admin_headers,
        json={"name": "Present records"},
    )
    assert duplicate.status_code == 409

    professor_preset = client.post(
        "/api/v1/reports/presets",
        headers=professor_headers,
        json={"name": "My weekly records", "filters": {"status": "absent"}},
    )
    assert professor_preset.status_code == 201, professor_preset.text

    listed = client.get("/api/v1/reports/presets", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1
    assert all(item["name"] == "Present records" for item in listed.json())

    forbidden_delete = client.delete(
        f"/api/v1/reports/presets/{professor_preset.json()['id']}", headers=admin_headers
    )
    assert forbidden_delete.status_code == 404

    deleted = client.delete(f"/api/v1/reports/presets/{preset['id']}", headers=admin_headers)
    assert deleted.status_code == 204
    assert client.get("/api/v1/reports/presets", headers=admin_headers).json() == []


def test_scheduled_exports_run_and_download(
    client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    fixture = _create_attendance(client, db_session)
    data = fixture["data"]
    professor_headers = fixture["professor_headers"]
    admin_headers = fixture["admin_headers"]

    now = utcnow()
    created = client.post(
        "/api/v1/reports/scheduled-exports",
        headers=professor_headers,
        json={
            "name": "Daily attendance",
            "format": "xlsx",
            "frequency": "daily",
            "filters": {"course_id": data["course"].id, "status": "present"},
        },
    )
    assert created.status_code == 201, created.text
    schedule = created.json()
    assert schedule["is_active"] is True
    assert schedule["filters"] == {"course_id": data["course"].id, "status": "present"}
    assert schedule["next_run_at"] > now.isoformat()

    listed = client.get("/api/v1/reports/scheduled-exports", headers=professor_headers)
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1

    admin_list = client.get("/api/v1/reports/scheduled-exports", headers=admin_headers)
    assert admin_list.json() == []

    forbidden_run = client.post(
        f"/api/v1/reports/scheduled-exports/{schedule['id']}/run", headers=admin_headers
    )
    assert forbidden_run.status_code == 404

    updated = client.patch(
        f"/api/v1/reports/scheduled-exports/{schedule['id']}",
        headers=professor_headers,
        json={"is_active": False, "frequency": "weekly"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["is_active"] is False
    assert updated.json()["frequency"] == "weekly"

    filtered = client.patch(
        f"/api/v1/reports/scheduled-exports/{schedule['id']}",
        headers=professor_headers,
        json={"filters": {"from_date": "2026-01-01T00:00:00"}},
    )
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["filters"] == {"from_date": "2026-01-01T00:00:00"}

    run = client.post(
        f"/api/v1/reports/scheduled-exports/{schedule['id']}/run", headers=professor_headers
    )
    assert run.status_code == 200, run.text
    assert run.json()["status"] == "ready"
    assert run.json()["size_bytes"] > 1000
    assert run.json()["filename"].endswith(".xlsx")

    runs = client.get(
        "/api/v1/reports/scheduled-exports/runs",
        headers=professor_headers,
        params={"schedule_id": schedule["id"]},
    )
    assert runs.status_code == 200, runs.text
    assert runs.json()["total"] == 1
    assert len(runs.json()["items"]) == 1

    downloaded = client.get(
        f"/api/v1/reports/scheduled-exports/runs/{run.json()['id']}/download",
        headers=professor_headers,
    )
    assert downloaded.status_code == 200, downloaded.text
    assert "spreadsheetml" in downloaded.headers["content-type"]
    assert downloaded.content.startswith(b"PK")

    def fail_export(*args: object, **kwargs: object) -> None:
        raise RuntimeError("export backend unavailable")

    monkeypatch.setattr(report_feature_service, "generate_export", fail_export)
    failed = client.post(
        f"/api/v1/reports/scheduled-exports/{schedule['id']}/run", headers=professor_headers
    )
    assert failed.status_code == 503
    failed_runs = client.get("/api/v1/reports/scheduled-exports/runs", headers=professor_headers)
    assert failed_runs.json()["total"] == 2
    assert any(item["status"] == "failed" for item in failed_runs.json()["items"])

    deleted = client.delete(
        f"/api/v1/reports/scheduled-exports/{schedule['id']}", headers=professor_headers
    )
    assert deleted.status_code == 204
    assert client.get("/api/v1/reports/scheduled-exports", headers=professor_headers).json() == []

    assert fixture["session"] is not None


def test_attendance_certificate_exports(
    client: TestClient, db_session: Session
) -> None:
    fixture = _create_attendance(client, db_session)
    student_headers = fixture["student_headers"]
    professor_headers = fixture["professor_headers"]

    certificate = client.get("/api/v1/attendance/me/certificate", headers=student_headers)
    assert certificate.status_code == 200, certificate.text
    assert certificate.content.startswith(b"%PDF")
    assert "attendance_certificate_STU-" in certificate.headers["content-disposition"]

    details = client.get(
        "/api/v1/attendance/me/certificate",
        headers=student_headers,
        params={"format": "xlsx", "include_details": True},
    )
    assert details.status_code == 200, details.text
    assert "spreadsheetml" in details.headers["content-type"]

    now = utcnow()
    invalid_range = client.get(
        "/api/v1/attendance/me/certificate",
        headers=student_headers,
        params={
            "from_date": (now + timedelta(days=1)).isoformat(),
            "to_date": now.isoformat(),
        },
    )
    assert invalid_range.status_code == 422

    denied = client.get("/api/v1/attendance/me/certificate", headers=professor_headers)
    assert denied.status_code == 403
