from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AttendanceCorrectionRequest, AttendanceRecord, AuditLog
from app.services import attendance_service
from app.utils.uuid import utcnow
from tests.conftest import (
    create_academic_data,
    create_session_record,
    create_user,
    login_headers,
)


def test_correction_request_student_create_list_and_withdraw(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    other_headers = login_headers(client, "other@university.edu", "Student123!")

    denied = client.post(
        "/api/v1/attendance/correction-requests",
        headers=other_headers,
        json={
            "session_id": session.id,
            "requested_status": "present",
            "reason": "I was present but the check-in failed",
        },
    )
    assert denied.status_code == 403

    created = client.post(
        "/api/v1/attendance/correction-requests",
        headers=student_headers,
        json={
            "session_id": session.id,
            "requested_status": "present",
            "reason": "I was present but the check-in failed",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "pending"
    assert body["student_name"] == "Enrolled Student"
    assert body["university_id"] == "STU-001"
    assert body["course_code"] == "CS101"
    assert body["session_id"] == session.id

    duplicate = client.post(
        "/api/v1/attendance/correction-requests",
        headers=student_headers,
        json={
            "session_id": session.id,
            "requested_status": "late",
            "reason": "A second request for the same session",
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "conflict"

    mine = client.get("/api/v1/attendance/correction-requests/me", headers=student_headers)
    assert mine.status_code == 200, mine.text
    assert mine.json()["total"] == 1
    assert mine.json()["items"][0]["id"] == body["id"]

    filtered = client.get(
        "/api/v1/attendance/correction-requests/me",
        headers=student_headers,
        params={"status": "approved"},
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 0

    withdrawn = client.post(
        f"/api/v1/attendance/correction-requests/{body['id']}/withdraw",
        headers=student_headers,
    )
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json() == {"status": "withdrawn"}

    assert db_session.get(AttendanceCorrectionRequest, body["id"]) is None
    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "attendance.correction_withdrawn")
    ).all()
    assert len(logs) == 1
    assert logs[0].entity_id == body["id"]

    after = client.get("/api/v1/attendance/correction-requests/me", headers=student_headers)
    assert after.json()["total"] == 0


def test_correction_request_review_by_professor_and_admin(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)
    create_user(
        db_session,
        email="otherprof@university.edu",
        password="Professor123!",
        role="professor",
        full_name="Other Professor",
        employee_id="EMP-002",
        department_id=data["department"].id,
    )
    create_user(
        db_session, email="review.admin@university.edu", password="Admin123!", role="admin"
    )
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    other_prof_headers = login_headers(client, "otherprof@university.edu", "Professor123!")
    admin_headers = login_headers(client, "review.admin@university.edu", "Admin123!")

    created = client.post(
        "/api/v1/attendance/correction-requests",
        headers=student_headers,
        json={
            "session_id": session.id,
            "requested_status": "present",
            "reason": "Check-in failed due to a connectivity problem",
        },
    )
    assert created.status_code == 201, created.text
    correction_id = created.json()["id"]

    denied = client.get("/api/v1/attendance/correction-requests", headers=student_headers)
    assert denied.status_code == 403

    other_view = client.get(
        "/api/v1/attendance/correction-requests", headers=other_prof_headers
    )
    assert other_view.status_code == 200
    assert other_view.json()["total"] == 0

    queue = client.get("/api/v1/attendance/correction-requests", headers=professor_headers)
    assert queue.status_code == 200, queue.text
    assert queue.json()["total"] == 1
    assert queue.json()["items"][0]["id"] == correction_id

    class_queue = client.get(
        "/api/v1/attendance/correction-requests",
        headers=professor_headers,
        params={"class_id": data["class"].id, "status": "pending"},
    )
    assert class_queue.status_code == 200
    assert class_queue.json()["total"] == 1

    forbidden_review = client.post(
        f"/api/v1/attendance/correction-requests/{correction_id}/review",
        headers=other_prof_headers,
        json={"decision": "approved"},
    )
    assert forbidden_review.status_code == 403

    missing_note = client.post(
        f"/api/v1/attendance/correction-requests/{correction_id}/review",
        headers=professor_headers,
        json={"decision": "rejected"},
    )
    assert missing_note.status_code == 422

    rejected = client.post(
        f"/api/v1/attendance/correction-requests/{correction_id}/review",
        headers=professor_headers,
        json={"decision": "rejected", "review_note": "No supporting evidence provided"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["review_note"] == "No supporting evidence provided"

    second = client.post(
        "/api/v1/attendance/correction-requests",
        headers=student_headers,
        json={
            "session_id": session.id,
            "requested_status": "late",
            "reason": "Arrived ten minutes late and was not marked",
        },
    )
    assert second.status_code == 201, second.text
    second_id = second.json()["id"]

    approved = client.post(
        f"/api/v1/attendance/correction-requests/{second_id}/review",
        headers=admin_headers,
        json={"decision": "approved", "final_status": "late", "review_note": "Approved after review"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["reviewed_at"] is not None

    records = db_session.scalars(
        select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)
    ).all()
    assert len(records) == 1
    assert records[0].status == "late"
    assert records[0].method == "manual"
    assert records[0].is_manual is True
    assert "Approved after review" in (records[0].correction_reason or "")

    approve_again = client.post(
        f"/api/v1/attendance/correction-requests/{second_id}/review",
        headers=professor_headers,
        json={"decision": "approved"},
    )
    assert approve_again.status_code == 409

    logs = db_session.scalars(
        select(AuditLog).where(
            AuditLog.action.in_(
                ["attendance.correction_rejected", "attendance.correction_approved"]
            )
        )
    ).all()
    assert {log.action for log in logs} == {
        "attendance.correction_rejected",
        "attendance.correction_approved",
    }


def test_review_without_final_method_preserves_record_method(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data)
    record = attendance_service._create_record(
        db_session,
        session=session,
        student=data["enrolled"],
        status="absent",
        method="qr",
        now=utcnow(),
        location_status="not_required",
        face_status="not_required",
    )
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")

    created = client.post(
        "/api/v1/attendance/correction-requests",
        headers=student_headers,
        json={
            "session_id": session.id,
            "record_id": record.id,
            "requested_status": "present",
            "reason": "Record exists but status needs review",
        },
    )
    assert created.status_code == 201, created.text

    reviewed = client.post(
        f"/api/v1/attendance/correction-requests/{created.json()['id']}/review",
        headers=professor_headers,
        json={"decision": "approved", "final_status": "present", "review_note": "Verified manually"},
    )
    assert reviewed.status_code == 200, reviewed.text
    assert record.method == "qr"
    assert record.status == "present"

    missing_record_session = create_session_record(db_session, data)
    created_without_record = client.post(
        "/api/v1/attendance/correction-requests",
        headers=student_headers,
        json={
            "session_id": missing_record_session.id,
            "requested_status": "late",
            "reason": "No attendance record was created for this session",
        },
    )
    assert created_without_record.status_code == 201, created_without_record.text

    reviewed_without_record = client.post(
        f"/api/v1/attendance/correction-requests/{created_without_record.json()['id']}/review",
        headers=professor_headers,
        json={"decision": "approved", "final_status": "late", "review_note": "Approved late arrival"},
    )
    assert reviewed_without_record.status_code == 200, reviewed_without_record.text
    fallback = db_session.scalar(
        select(AttendanceRecord).where(AttendanceRecord.session_id == missing_record_session.id)
    )
    assert fallback is not None
    assert fallback.method == "manual"
