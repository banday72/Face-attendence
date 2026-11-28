from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AttendanceRecord, AuditLog, RefreshToken, Student, User
from app.utils.uuid import new_uuid, utcnow
from tests.conftest import (
    create_academic_data,
    create_session_record,
    create_user,
    login_headers,
)


def test_admin_creates_role_specific_accounts_and_options(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin", full_name="Admin")
    headers = login_headers(client, "admin@university.edu", "Admin123!")
    department = client.post(
        "/api/v1/admin/departments",
        headers=headers,
        json={"name": "Engineering", "code": "ENG"},
    )
    assert department.status_code == 201
    department_id = department.json()["id"]

    professor = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": "newprof@university.edu",
            "password": "Professor123!",
            "full_name": "New Professor",
            "role": "professor",
            "employee_id": "EMP-100",
            "department_id": department_id,
            "title": "Dr.",
            "office": "Room 12",
        },
    )
    assert professor.status_code == 201, professor.text
    assert professor.json()["employee_id"] == "EMP-100"
    assert professor.json()["title"] == "Dr."

    student = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": "newstudent@university.edu",
            "password": "Student123!",
            "full_name": "New Student",
            "role": "student",
            "university_id": "STU-100",
            "department_id": department_id,
            "program": "Software Engineering",
            "year_level": 2,
        },
    )
    assert student.status_code == 201, student.text
    assert student.json()["university_id"] == "STU-100"
    assert student.json()["program"] == "Software Engineering"

    professor_options = client.get("/api/v1/admin/professors", headers=headers, params={"page_size": 100})
    assert professor_options.status_code == 200
    professor_option = next(
        item for item in professor_options.json()["items"] if item["employee_id"] == "EMP-100"
    )
    assert professor_option["id"] != professor_option["user_id"]

    student_options = client.get("/api/v1/admin/students", headers=headers, params={"page_size": 100})
    assert student_options.status_code == 200
    student_option = next(
        item for item in student_options.json()["items"] if item["university_id"] == "STU-100"
    )
    assert student_option["id"] != student_option["user_id"]


def test_admin_assigns_professor_to_course_and_creates_section_enrollment(
    client: TestClient, db_session: Session
) -> None:
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin", full_name="Admin")
    data = create_academic_data(db_session)
    headers = login_headers(client, "admin@university.edu", "Admin123!")
    course_id = str(data["course"].id)
    professor_id = str(data["professor"].id)

    assigned = client.post(f"/api/v1/admin/courses/{course_id}/professors/{professor_id}", headers=headers)
    assert assigned.status_code == 201, assigned.text
    assert assigned.json()["professor_id"] == professor_id

    duplicate = client.post(f"/api/v1/admin/courses/{course_id}/professors/{professor_id}", headers=headers)
    assert duplicate.status_code == 409

    assign_log = (
        db_session.query(AuditLog).filter(AuditLog.action == "course_professor.assign").one()
    )
    assert assign_log.entity_id == professor_id
    assert len(assign_log.entity_id or "") <= 36
    assert assign_log.after_json["course_id"] == course_id

    listed = client.get(f"/api/v1/admin/courses/{course_id}/professors", headers=headers)
    assert listed.status_code == 200
    assert [item["professor_id"] for item in listed.json()] == [professor_id]

    section = client.post(
        "/api/v1/admin/classes",
        headers=headers,
        json={
            "course_id": course_id,
            "professor_id": professor_id,
            "department_id": str(data["department"].id),
            "section": "B",
            "term": "Spring-2027",
            "capacity": 40,
            "is_active": True,
        },
    )
    assert section.status_code == 201, section.text
    class_id = section.json()["id"]
    assert section.json()["professor_id"] == professor_id

    enrolled = client.post(
        f"/api/v1/admin/classes/{class_id}/enrollments",
        headers=headers,
        json={"student_id": str(data["other"].id)},
    )
    assert enrolled.status_code == 201, enrolled.text
    assert enrolled.json()["student_id"] == str(data["other"].id)

    unassigned = client.delete(f"/api/v1/admin/courses/{course_id}/professors/{professor_id}", headers=headers)
    assert unassigned.status_code == 204

    unassign_log = (
        db_session.query(AuditLog).filter(AuditLog.action == "course_professor.unassign").one()
    )
    assert unassign_log.entity_id == professor_id
    assert len(unassign_log.entity_id or "") <= 36


def test_admin_password_reset_revokes_refresh_sessions(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin", full_name="Admin")
    create_user(
        db_session,
        email="target@university.edu",
        password="Student123!",
        role="student",
        full_name="Target Student",
        university_id="TGT-100",
    )
    admin_headers = login_headers(client, "admin@university.edu", "Admin123!")
    client.post("/api/v1/auth/login", json={"email": "target@university.edu", "password": "Student123!"})
    user = db_session.scalar(select(User).where(User.email == "target@university.edu"))
    assert user is not None

    response = client.post(
        f"/api/v1/admin/users/{user.id}/reset-password",
        headers=admin_headers,
        json={"password": "NewStudent123!"},
    )
    assert response.status_code == 200, response.text

    tokens = db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert tokens
    assert all(token.revoked_at is not None for token in tokens)

    old_login = client.post(
        "/api/v1/auth/login", json={"email": "target@university.edu", "password": "Student123!"}
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login", json={"email": "target@university.edu", "password": "NewStudent123!"}
    )
    assert new_login.status_code == 200

    admin_self = db_session.scalar(select(User).where(User.email == "admin@university.edu"))
    assert admin_self is not None
    blocked = client.post(
        f"/api/v1/admin/users/{admin_self.id}/reset-password",
        headers=admin_headers,
        json={"password": "AnotherAdmin123!"},
    )
    assert blocked.status_code == 409


def test_admin_user_update_supports_profile_fields(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin", full_name="Admin")
    create_user(
        db_session,
        email="student@university.edu",
        password="Student123!",
        role="student",
        full_name="Student",
        university_id="STU-200",
    )
    headers = login_headers(client, "admin@university.edu", "Admin123!")
    user = db_session.scalar(select(User).where(User.email == "student@university.edu"))
    assert user is not None

    response = client.patch(
        f"/api/v1/admin/users/{user.id}",
        headers=headers,
        json={"program": "Data Science", "year_level": 3, "is_active": False},
    )
    assert response.status_code == 200, response.text
    assert response.json()["program"] == "Data Science"
    assert response.json()["year_level"] == 3
    assert response.json()["is_active"] is False

    student = db_session.scalar(select(Student).where(Student.user_id == user.id))
    assert student is not None
    assert student.program == "Data Science"
    assert student.year_level == 3


def test_admin_bulk_import_reports_row_errors(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin", full_name="Admin")
    headers = login_headers(client, "admin@university.edu", "Admin123!")
    csv_text = (
        "role,full_name,email,password,university_id\n"
        "student,Bulk Student,bulk@university.edu,Student123!,STU-300\n"
        "student,Weak Password,weak@university.edu,short,STU-301\n"
    )

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        files={"file": ("users.csv", csv_text, "text/csv")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert body["created"] == 1
    assert body["failed"] == 1
    assert body["errors"][0]["row"] == 3


def test_admin_alerts_include_low_attendance_students(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin", full_name="Admin")
    enrolled = data["enrolled"]
    for status in ("present", "absent", "absent"):
        session = create_session_record(db_session, data)
        db_session.add(
            AttendanceRecord(
                id=new_uuid(),
                session_id=session.id,
                student_id=enrolled.id,
                status=status,
                method="qr",
                marked_at=utcnow(),
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    db_session.commit()
    headers = login_headers(client, "admin@university.edu", "Admin123!")

    response = client.get("/api/v1/admin/alerts", headers=headers)
    assert response.status_code == 200, response.text
    titles = [alert["title"] for alert in response.json()["items"]]
    assert any("Low attendance" in title for title in titles)
