from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AttendanceRecord, AuditLog, User
from app.utils.uuid import new_uuid, utcnow
from tests.conftest import (
    create_academic_data,
    create_session_record,
    create_user,
    login_headers,
)


def face_payload() -> dict[str, object]:
    descriptor = [1.0] + [0.0] * 127
    return {
        "consent_version": settings.biometric_consent_version,
        "descriptors": [descriptor, descriptor, descriptor],
        "centers": [[0.0, 0.0], [50.0, 0.0], [100.0, 0.0]],
    }


def _add_record(db: Session, session_id: str, student_id: str, status: str) -> None:
    now = utcnow()
    db.add(
        AttendanceRecord(
            id=new_uuid(),
            session_id=session_id,
            student_id=student_id,
            status=status,
            method="system",
            marked_at=now,
            location_status="not_required",
            face_status="not_required",
            is_manual=False,
            correction_reason=None,
            created_at=now,
            updated_at=now,
        )
    )


def test_profile_read_update_and_consent(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    create_user(
        db_session, email="profile.prof@university.edu", password="Professor123!",
        role="professor", full_name="Profile Professor", employee_id="EMP-PROFILE",
        department_id=data["department"].id,
    )
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    professor_headers = login_headers(client, "profile.prof@university.edu", "Professor123!")

    profile = client.get("/api/v1/me/profile", headers=student_headers)
    assert profile.status_code == 200, profile.text
    assert profile.json()["university_id"] == "STU-001"
    assert profile.json()["department_name"] == "Computer Science"

    updated = client.patch(
        "/api/v1/me/profile",
        headers=student_headers,
        json={
            "full_name": "Renamed Student",
            "phone": "+10000000000",
            "program": "Computer Science",
            "year_level": 2,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["full_name"] == "Renamed Student"
    assert updated.json()["program"] == "Computer Science"
    assert updated.json()["year_level"] == 2

    professor_update = client.patch(
        "/api/v1/me/profile",
        headers=professor_headers,
        json={"full_name": "Renamed Professor"},
    )
    assert professor_update.status_code == 200, professor_update.text
    assert professor_update.json()["employee_id"] == "EMP-PROFILE"

    consent = client.get("/api/v1/me/consent", headers=student_headers)
    assert consent.status_code == 200, consent.text
    assert consent.json()["requires_new_consent"] is True

    accepted = client.post("/api/v1/me/consent", headers=student_headers, json={})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["is_active"] is True
    assert accepted.json()["consent_version"] == settings.biometric_consent_version
    assert accepted.json()["requires_new_consent"] is False

    current = client.get("/api/v1/me/consent", headers=student_headers)
    assert current.json()["is_active"] is True

    outdated = client.post(
        "/api/v1/me/consent",
        headers=student_headers,
        json={"consent_version": "outdated"},
    )
    assert outdated.status_code == 422

    student = db_session.scalar(
        select(User).where(User.email == "enrolled@university.edu")
    )
    assert student is not None
    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "consent.accept", AuditLog.actor_user_id == student.id
        )
    )
    assert log is not None
    assert log.after_json["consent_version"] == settings.biometric_consent_version

    denied = client.get("/api/v1/me/consent", headers=professor_headers)
    assert denied.status_code == 403


def test_face_data_export(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    registered = client.post("/api/v1/face/register", headers=student_headers, json=face_payload())
    assert registered.status_code == 201, registered.text

    exported = client.get("/api/v1/face/me/export", headers=student_headers)
    assert exported.status_code == 200, exported.text
    body = exported.json()
    assert body["embedding_count"] == 3
    assert len(body["descriptors"]) == 3
    assert len(body["embeddings"]) == 3
    assert len(body["descriptors"][0]) == 128
    assert body["university_id"] == "STU-001"
    assert body["consent"]["is_active"] is True
    assert body["consent_metadata"]["consent_version"] == settings.biometric_consent_version
    assert body["vector_version"] == "2"

    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "face.export"))
    assert log is not None
    assert log.after_json["embedding_count"] == 3

    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    denied = client.get("/api/v1/face/me/export", headers=professor_headers)
    assert denied.status_code == 403
    assert data["enrolled"] is not None


def test_alerts_for_student_professor_and_admin(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    create_user(db_session, email="alerts.admin@university.edu", password="Admin123!", role="admin")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    admin_headers = login_headers(client, "alerts.admin@university.edu", "Admin123!")

    now = utcnow()
    sessions = [
        create_session_record(
            db_session,
            data,
            starts_at=now - timedelta(hours=3),
            ends_at=now - timedelta(hours=2),
        )
        for _ in range(3)
    ]
    for index, session in enumerate(sessions):
        _add_record(
            db_session,
            session.id,
            data["enrolled"].id,
            "present" if index == 0 else "absent",
        )
    attention_session = create_session_record(
        db_session,
        data,
        starts_at=now - timedelta(hours=2),
        ends_at=now - timedelta(hours=1),
        status="active",
        current_qr_hash=None,
    )
    db_session.flush()

    student_alerts = client.get("/api/v1/me/alerts", headers=student_headers)
    assert student_alerts.status_code == 200, student_alerts.text
    student_items = student_alerts.json()["items"]
    assert any(item["id"].startswith("low-attendance-") for item in student_items)
    assert any(item["id"].startswith("consent-") for item in student_items)

    professor_alerts = client.get("/api/v1/me/alerts", headers=professor_headers)
    assert professor_alerts.status_code == 200, professor_alerts.text
    professor_items = professor_alerts.json()["items"]
    assert any(item["id"] == f"low-attendance-{data['enrolled'].id}" for item in professor_items)
    assert any(item["id"] == f"session-{attention_session.id}" for item in professor_items)

    admin_alerts = client.get("/api/v1/me/alerts", headers=admin_headers)
    assert admin_alerts.status_code == 200, admin_alerts.text
    assert len(admin_alerts.json()["items"]) >= 2
