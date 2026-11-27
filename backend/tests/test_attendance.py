from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import AttendanceRecord, AuditLog, Enrollment, QRTokenUsage
from app.services import location_service, qr_service
from app.utils.uuid import new_uuid, utcnow
from tests.conftest import (
    create_academic_data,
    create_session_record,
    create_user,
    login_headers,
    start_session_via_api,
)


def test_enrollment_is_required_for_qr_check_in(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    token = start_session_via_api(client, session.id, professor_headers)
    other_headers = login_headers(client, "other@university.edu", "Student123!")

    response = client.post(
        "/api/v1/attendance/qr",
        headers=other_headers,
        json={"token": token, "latitude": 37.7749, "longitude": -122.4194, "accuracy": 5},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_qr_duplicate_and_expired_tokens(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    token = start_session_via_api(client, session.id, professor_headers)
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    payload = {"token": token, "latitude": 37.7749, "longitude": -122.4194, "accuracy": 5}

    first = client.post("/api/v1/attendance/qr", headers=student_headers, json=payload)
    assert first.status_code == 201, first.text
    assert first.json()["status"] == "present"

    duplicate = client.post("/api/v1/attendance/qr", headers=student_headers, json=payload)
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "duplicate_attendance"

    session.current_qr_expires_at = utcnow() - timedelta(seconds=1)
    db_session.flush()
    expired = client.post("/api/v1/attendance/qr", headers=student_headers, json=payload)
    assert expired.status_code == 403
    assert expired.json()["error"]["code"] == "session_expired"


def test_closing_session_marks_enrolled_students_absent(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    second_enrollment = Enrollment(
        id=new_uuid(),
        class_id=data["class"].id,
        student_id=data["other"].id,
        status="enrolled",
        created_at=utcnow() - timedelta(hours=1),
        updated_at=utcnow(),
    )
    db_session.add(second_enrollment)
    db_session.flush()
    session = create_session_record(db_session, data)
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    start_session_via_api(client, session.id, professor_headers)

    closed = client.post(f"/api/v1/sessions/{session.id}/close", headers=professor_headers)
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "closed"
    assert closed.json()["absent_count"] == 2

    records = db_session.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)).all()
    assert len(records) == 2
    assert {record.status for record in records} == {"absent"}


def test_mid_session_enrollment_not_marked_absent(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    now = utcnow()
    session = create_session_record(
        db_session, data, starts_at=now - timedelta(minutes=30), ends_at=now + timedelta(minutes=30)
    )
    db_session.add(
        Enrollment(
            id=new_uuid(),
            class_id=data["class"].id,
            student_id=data["other"].id,
            status="enrolled",
            created_at=now,
            updated_at=now,
        )
    )
    db_session.flush()
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    start_session_via_api(client, session.id, professor_headers)

    closed = client.post(f"/api/v1/sessions/{session.id}/close", headers=professor_headers)
    assert closed.status_code == 200
    assert closed.json()["absent_count"] == 1
    records = db_session.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)).all()
    assert len(records) == 1
    assert records[0].student_id == data["enrolled"].id


def test_location_radius_verification(db_session: Session) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)

    verified = location_service.verify_location(session, 37.77491, -122.41941, 5)
    assert verified.status == "verified"
    assert verified.distance_meters is not None and verified.distance_meters < 10

    with pytest.raises(AppError) as exc:
        location_service.verify_location(session, 40.7128, -74.0060, 5)
    assert exc.value.code == "location_out_of_range"
    assert exc.value.status_code == 403


def test_manual_correction_requires_reason_and_writes_audit(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    token = start_session_via_api(client, session.id, professor_headers)
    checkin = client.post(
        "/api/v1/attendance/qr",
        headers=student_headers,
        json={"token": token, "latitude": 37.7749, "longitude": -122.4194, "accuracy": 5},
    )
    assert checkin.status_code == 201
    record_id = checkin.json()["id"]

    missing_reason = client.patch(
        f"/api/v1/attendance/{record_id}",
        headers=professor_headers,
        json={"status": "late", "method": "manual", "reason": ""},
    )
    assert missing_reason.status_code == 422

    denied = client.patch(
        f"/api/v1/attendance/{record_id}",
        headers=student_headers,
        json={"status": "late", "method": "manual", "reason": "Student cannot edit"},
    )
    assert denied.status_code == 403

    corrected = client.patch(
        f"/api/v1/attendance/{record_id}",
        headers=professor_headers,
        json={"status": "late", "method": "manual", "reason": "Late arrival confirmed by professor"},
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["status"] == "late"
    assert corrected.json()["is_manual"] is True

    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "attendance.manual_correction"))
    assert log is not None
    assert log.entity_id == record_id
    assert log.before_json["status"] == "present"
    assert log.after_json["status"] == "late"
    assert log.reason == "Late arrival confirmed by professor"


def test_qr_duplicate_race_maps_to_conflict_and_preserves_outer_transaction(db_session: Session) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)
    token = "uat:v1:dup-race-token"
    token_hash = qr_service.hash_token(token)
    session.current_qr_hash = token_hash
    session.current_qr_expires_at = utcnow() + timedelta(minutes=5)
    session.status = "active"
    db_session.flush()

    db_session.add(
        QRTokenUsage(
            id=new_uuid(),
            session_id=session.id,
            token_hash=token_hash,
            student_id=data["enrolled"].id,
            used_at=utcnow(),
            created_at=utcnow(),
        )
    )
    db_session.flush()

    with pytest.raises(AppError) as exc:
        qr_service.consume_qr_token(db_session, session, token_hash, data["enrolled"].id, utcnow())
    assert exc.value.status_code == 409
    assert exc.value.code == "duplicate_attendance"

    marker = AuditLog(
        id=new_uuid(),
        actor_user_id=data["professor_user"].id,
        action="test.marker",
        entity_type="test",
        entity_id=session.id,
        before_json={},
        after_json={"ok": True},
        reason="outer transaction still usable",
        ip_address=None,
        user_agent=None,
        created_at=utcnow(),
    )
    db_session.add(marker)
    db_session.commit()
    assert db_session.get(AuditLog, marker.id) is not None


def test_sessions_list_filters_and_rbac(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    create_user(db_session, email="admin2@university.edu", password="Admin123!", role="admin", full_name="Admin2")
    create_user(db_session, email="otherprof@university.edu", password="Professor123!", role="professor", full_name="Other Prof", employee_id="EMP-002", department_id=data["department"].id)
    session = create_session_record(db_session, data)
    prof_headers = login_headers(client, "prof@university.edu", "Professor123!")
    admin_headers = login_headers(client, "admin2@university.edu", "Admin123!")
    other_prof_headers = login_headers(client, "otherprof@university.edu", "Professor123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")

    denied = client.get("/api/v1/sessions", headers=student_headers)
    assert denied.status_code == 403

    listed = client.get("/api/v1/sessions", headers=prof_headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == session.id

    filtered = client.get(f"/api/v1/sessions?class_id={data['class'].id}&status=scheduled", headers=prof_headers)
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1

    other = client.get("/api/v1/sessions", headers=other_prof_headers)
    assert other.status_code == 200
    assert other.json()["total"] == 0

    admin = client.get("/api/v1/sessions", headers=admin_headers)
    assert admin.status_code == 200
    assert admin.json()["total"] == 1


def test_my_attendance_search_and_class_fields(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    token = start_session_via_api(client, session.id, professor_headers)

    checkin = client.post(
        "/api/v1/attendance/qr",
        headers=student_headers,
        json={"token": token, "latitude": 37.7749, "longitude": -122.4194, "accuracy": 5},
    )
    assert checkin.status_code == 201, checkin.text
    record = checkin.json()
    assert record["class_id"] == data["class"].id
    assert record["class_name"] == "A"
    assert record["course_id"] == data["course"].id
    assert record["course_name"] == "Intro to Programming"

    for term in ("CS101", "Programming", "A"):
        filtered = client.get(
            "/api/v1/attendance/me", headers=student_headers, params={"search": term}
        )
        assert filtered.status_code == 200, filtered.text
        assert filtered.json()["total"] == 1
        assert filtered.json()["items"][0]["id"] == record["id"]

    no_match = client.get("/api/v1/attendance/me", headers=student_headers, params={"search": "NoSuchCourse"})
    assert no_match.status_code == 200
    assert no_match.json()["total"] == 0


def test_session_qr_validity_has_five_minute_minimum(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    headers = login_headers(client, "prof@university.edu", "Professor123!")
    now = utcnow()
    payload = {
        "class_id": data["class"].id,
        "classroom_id": data["classroom"].id,
        "starts_at": now.isoformat(),
        "ends_at": (now + timedelta(hours=1)).isoformat(),
        "require_location": True,
        "require_face": False,
        "qr_validity_seconds": 299,
    }

    too_short = client.post("/api/v1/sessions", headers=headers, json=payload)
    assert too_short.status_code == 422

    payload["qr_validity_seconds"] = 300
    created = client.post("/api/v1/sessions", headers=headers, json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["qr_validity_seconds"] == 300
