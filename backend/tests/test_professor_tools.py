from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AttendanceRecord, AuditLog, Enrollment
from app.utils.uuid import new_uuid, utcnow
from tests.conftest import (
    create_academic_data,
    create_session_record,
    create_user,
    login_headers,
    start_session_via_api,
)


def _enroll_other(db: Session, data: dict[str, object]) -> None:
    db.add(
        Enrollment(
            id=new_uuid(),
            class_id=data["class"].id,
            student_id=data["other"].id,
            status="enrolled",
            created_at=utcnow() - timedelta(hours=2),
            updated_at=utcnow(),
        )
    )
    db.flush()


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


def test_missing_attendance_and_mark_remaining_absent(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    _enroll_other(db_session, data)
    create_user(
        db_session,
        email="missing.prof@university.edu",
        password="Professor123!",
        role="professor",
        full_name="Unassigned Professor",
        employee_id="EMP-MISSING",
        department_id=data["department"].id,
    )
    session = create_session_record(db_session, data)
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    other_prof_headers = login_headers(client, "missing.prof@university.edu", "Professor123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")

    denied_student = client.get(
        f"/api/v1/sessions/{session.id}/attendance/missing", headers=student_headers
    )
    assert denied_student.status_code == 403

    denied_professor = client.get(
        f"/api/v1/sessions/{session.id}/attendance/missing", headers=other_prof_headers
    )
    assert denied_professor.status_code == 403

    missing = client.get(
        f"/api/v1/sessions/{session.id}/attendance/missing", headers=professor_headers
    )
    assert missing.status_code == 200, missing.text
    assert len(missing.json()) == 2
    assert {item["student_id"] for item in missing.json()} == {
        data["enrolled"].id,
        data["other"].id,
    }

    token = start_session_via_api(client, session.id, professor_headers)
    checkin = client.post(
        "/api/v1/attendance/qr",
        headers=student_headers,
        json={"token": token, "latitude": 37.7749, "longitude": -122.4194, "accuracy": 5},
    )
    assert checkin.status_code == 201, checkin.text

    remaining = client.get(
        f"/api/v1/sessions/{session.id}/attendance/missing", headers=professor_headers
    )
    assert len(remaining.json()) == 1
    assert remaining.json()[0]["student_id"] == data["other"].id

    marked = client.post(
        f"/api/v1/sessions/{session.id}/attendance/mark-absent", headers=professor_headers
    )
    assert marked.status_code == 200, marked.text
    assert marked.json()["marked_count"] == 1
    assert marked.json()["marked_student_ids"] == [data["other"].id]

    records = db_session.scalars(
        select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)
    ).all()
    assert len(records) == 2
    absent = [record for record in records if record.student_id == data["other"].id]
    assert len(absent) == 1
    assert absent[0].status == "absent"
    assert absent[0].method == "system"

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "attendance.mark_remaining_absent")
    ).all()
    assert len(logs) == 1
    assert logs[0].after_json["marked_student_ids"] == [data["other"].id]

    again = client.post(
        f"/api/v1/sessions/{session.id}/attendance/mark-absent", headers=professor_headers
    )
    assert again.status_code == 200
    assert again.json()["marked_count"] == 0


def test_professor_classes_risk_counts_each_at_risk_student(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    _enroll_other(db_session, data)
    create_user(
        db_session,
        email="risk.prof@university.edu",
        password="Professor123!",
        role="professor",
        full_name="Risk Professor",
        employee_id="EMP-RISK",
        department_id=data["department"].id,
    )
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    other_prof_headers = login_headers(client, "risk.prof@university.edu", "Professor123!")

    now = utcnow()
    for index in range(4):
        session = create_session_record(
            db_session,
            data,
            starts_at=now - timedelta(hours=8 - index),
            ends_at=now - timedelta(hours=7 - index),
        )
        if index < 3:
            _add_record(
                db_session,
                session.id,
                data["enrolled"].id,
                "present" if index == 0 else "absent",
            )
        _add_record(
            db_session,
            session.id,
            data["other"].id,
            "late" if index == 0 else "absent",
        )
    db_session.flush()

    risks = client.get("/api/v1/professor/classes/risk", headers=professor_headers)
    assert risks.status_code == 200, risks.text
    assert len(risks.json()) == 1
    item = risks.json()[0]
    assert item["class_id"] == data["class"].id
    assert item["enrolled_count"] == 2
    assert item["total_sessions"] == 4
    assert item["present"] == 1
    assert item["late"] == 1
    assert item["absent"] == 5
    assert item["at_risk_count"] == 2
    assert item["attendance_rate"] == 28.57

    other = client.get("/api/v1/professor/classes/risk", headers=other_prof_headers)
    assert other.status_code == 200
    assert other.json() == []

    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    denied = client.get("/api/v1/professor/classes/risk", headers=student_headers)
    assert denied.status_code == 403
