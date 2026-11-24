from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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
