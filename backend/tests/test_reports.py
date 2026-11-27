from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, ScheduledExportRun, ScheduledReportExport
from app.services import report_feature_service
from app.utils.uuid import new_uuid, utcnow
from tests.conftest import (
    create_academic_data,
    create_session_record,
    create_user,
    login_headers,
    start_session_via_api,
)


def test_report_summary_records_and_exports(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    create_user(db_session, email="reports.admin@university.edu", password="Admin123!", role="admin", full_name="Reports Admin")
    admin_headers = login_headers(client, "reports.admin@university.edu", "Admin123!")
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")

    session = create_session_record(db_session, data)
    token = start_session_via_api(client, session.id, professor_headers)
    checkin = client.post(
        "/api/v1/attendance/qr",
        headers=student_headers,
        json={"token": token, "latitude": 37.7749, "longitude": -122.4194, "accuracy": 5},
    )
    assert checkin.status_code == 201

    summary = client.get("/api/v1/reports/summary?period=course", headers=admin_headers)
    assert summary.status_code == 200, summary.text
    assert summary.json()["total_records"] == 1
    assert summary.json()["by_status"]["present"] == 1
    assert summary.json()["groups"][0]["group"].startswith("CS101")

    records = client.get("/api/v1/reports/records", headers=admin_headers)
    assert records.status_code == 200
    assert records.json()["total"] == 1
    assert records.json()["items"][0]["university_id"] == "STU-001"

    professor_summary = client.get("/api/v1/reports/summary?period=daily", headers=professor_headers)
    assert professor_summary.status_code == 200
    assert professor_summary.json()["total_records"] == 1

    xlsx = client.get("/api/v1/reports/export?format=xlsx", headers=admin_headers)
    assert xlsx.status_code == 200
    assert "spreadsheetml" in xlsx.headers["content-type"]
    assert "attachment" in xlsx.headers["content-disposition"]
    assert len(xlsx.content) > 1000

    pdf = client.get("/api/v1/reports/export?format=pdf", headers=admin_headers)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")

    denied = client.get("/api/v1/reports/summary", headers=student_headers)
    assert denied.status_code == 403


def test_report_filter_class_id_is_passed_to_report_filters() -> None:
    filters = report_feature_service.build_report_filters({"class_id": "class-123"})
    assert filters.class_id == "class-123"


def test_preset_patch_updates_default_and_writes_audit(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="preset.admin@university.edu", password="Admin123!", role="admin")
    headers = login_headers(client, "preset.admin@university.edu", "Admin123!")

    first = client.post(
        "/api/v1/reports/presets",
        headers=headers,
        json={"name": "First", "filters": {"status": "present"}, "is_default": True},
    )
    assert first.status_code == 201, first.text
    second = client.post(
        "/api/v1/reports/presets",
        headers=headers,
        json={"name": "Second", "filters": {"status": "absent"}},
    )
    assert second.status_code == 201, second.text

    patched = client.patch(
        f"/api/v1/reports/presets/{second.json()['id']}",
        headers=headers,
        json={"name": "Second updated", "filters": {"class_id": "class-123"}, "is_default": True},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["name"] == "Second updated"
    assert patched.json()["filters"] == {"class_id": "class-123"}
    assert patched.json()["is_default"] is True

    presets = {item["id"]: item for item in client.get("/api/v1/reports/presets", headers=headers).json()}
    assert presets[first.json()["id"]]["is_default"] is False
    assert presets[second.json()["id"]]["is_default"] is True

    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "report.preset_update",
            AuditLog.entity_id == second.json()["id"],
        )
    )
    assert log is not None
    assert log.after_json["cleared_default_ids"] == [first.json()["id"]]


def test_scheduled_export_runs_are_paginated(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="runs.admin@university.edu", password="Admin123!", role="admin")
    headers = login_headers(client, "runs.admin@university.edu", "Admin123!")
    created = client.post(
        "/api/v1/reports/scheduled-exports",
        headers=headers,
        json={"name": "Paged runs", "format": "xlsx", "frequency": "daily"},
    )
    assert created.status_code == 201, created.text
    schedule_id = created.json()["id"]
    for _ in range(2):
        run = client.post(f"/api/v1/reports/scheduled-exports/{schedule_id}/run", headers=headers)
        assert run.status_code == 200, run.text

    first_page = client.get(
        "/api/v1/reports/scheduled-exports/runs",
        headers=headers,
        params={"page": 1, "page_size": 1, "schedule_id": schedule_id},
    )
    assert first_page.status_code == 200, first_page.text
    body = first_page.json()
    assert body["total"] == 2
    assert body["page"] == 1
    assert body["page_size"] == 1
    assert body["pages"] == 2
    assert len(body["items"]) == 1
    assert body["items"][0]["schedule_id"] == schedule_id

    second_page = client.get(
        "/api/v1/reports/scheduled-exports/runs",
        headers=headers,
        params={"page": 2, "page_size": 1, "schedule_id": schedule_id},
    )
    assert second_page.status_code == 200, second_page.text
    assert second_page.json()["items"][0]["id"] != body["items"][0]["id"]

    other_schedule = client.get(
        "/api/v1/reports/scheduled-exports/runs",
        headers=headers,
        params={"page": 1, "page_size": 20, "schedule_id": "unknown"},
    )
    assert other_schedule.json()["total"] == 0


def test_run_due_scheduled_exports_continues_after_failure(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    data = create_academic_data(db_session)
    now = utcnow()
    original_generate_export = report_feature_service.generate_export

    def _schedule(name: str, filters: dict[str, object], *, due: bool = True, active: bool = True) -> ScheduledReportExport:
        schedule = ScheduledReportExport(
            id=new_uuid(),
            user_id=data["professor_user"].id,
            name=name,
            format="xlsx",
            frequency="daily",
            filters=filters,
            next_run_at=now - timedelta(minutes=5) if due else now + timedelta(days=1),
            last_run_at=None,
            is_active=active,
            created_at=now,
            updated_at=now,
        )
        db_session.add(schedule)
        db_session.flush()
        return schedule

    ready = _schedule("Ready", {"status": "present"})
    failing = _schedule("Failing", {"status": "absent"})
    _schedule("Future", {"status": "present"}, due=False)
    _schedule("Inactive", {"status": "present"}, active=False)

    def selective_export(db: object, filters: object, format: object, scope_professor_id: object) -> tuple[bytes, str, str]:
        if isinstance(filters, dict) and filters.get("status") == "absent":
            raise RuntimeError("export backend unavailable")
        return original_generate_export(db, filters, format, scope_professor_id)

    monkeypatch.setattr(report_feature_service, "generate_export", selective_export)

    processed = report_feature_service.run_due_scheduled_exports(db_session, now=now, limit=20)
    assert processed == 2

    runs = db_session.scalars(select(ScheduledExportRun)).all()
    assert len(runs) == 2
    ready_run = next(run for run in runs if run.schedule_id == ready.id)
    failing_run = next(run for run in runs if run.schedule_id == failing.id)
    assert ready_run.status == "ready"
    assert ready_run.error is None
    assert ready_run.content.startswith(b"PK")
    assert failing_run.status == "failed"
    assert "export backend unavailable" in (failing_run.error or "")

    expected_next = report_feature_service.calculate_next_run_at("daily", now)
    assert ready.last_run_at == now
    assert ready.next_run_at == expected_next
    assert failing.last_run_at == now
    assert failing.next_run_at == expected_next

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "report.scheduled_run")
    ).all()
    assert len(logs) == 2
