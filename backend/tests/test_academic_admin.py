from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Professor
from tests.conftest import create_academic_data, create_user, login_headers


def _admin_headers(client: TestClient, db_session: Session) -> dict[str, str]:
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin")
    return login_headers(client, "admin@university.edu", "Admin123!")


def test_semester_crud_and_class_integration(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    headers = _admin_headers(client, db_session)

    created = client.post(
        "/api/v1/admin/semesters",
        headers=headers,
        json={
            "name": "Spring 2027",
            "code": "SP2027",
            "academic_year": "2027",
            "start_date": "2027-01-10",
            "end_date": "2027-05-20",
            "is_active": True,
        },
    )
    assert created.status_code == 201, created.text
    semester = created.json()
    assert semester["is_active"] is True
    assert semester["class_count"] == 0

    listed = client.get("/api/v1/admin/semesters", headers=headers, params={"is_active": True})
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == semester["id"]

    options = client.get("/api/v1/semesters", headers=headers, params={"search": "2027"})
    assert options.status_code == 200, options.text
    assert options.json()["items"][0]["code"] == "SP2027"

    class_response = client.post(
        "/api/v1/admin/classes",
        headers=headers,
        json={
            "course_id": data["course"].id,
            "semester_id": semester["id"],
            "section": "B",
            "capacity": 25,
        },
    )
    assert class_response.status_code == 201, class_response.text
    class_item = class_response.json()
    assert class_item["term"] == "Spring 2027"
    assert class_item["semester"] == "Spring 2027"
    assert class_item["academic_year"] == "2027"

    filtered = client.get(
        "/api/v1/admin/classes", headers=headers, params={"semester_id": semester["id"]}
    )
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["total"] == 1

    conflict = client.delete(f"/api/v1/admin/semesters/{semester['id']}", headers=headers)
    assert conflict.status_code == 409

    patched = client.patch(
        f"/api/v1/admin/semesters/{semester['id']}",
        headers=headers,
        json={"name": "Spring Term 2027", "is_active": False},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["name"] == "Spring Term 2027"
    assert patched.json()["is_active"] is False


def test_faculty_listing_and_class_assignments(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    headers = _admin_headers(client, db_session)
    create_user(
        db_session,
        email="second.prof@university.edu",
        password="Professor123!",
        role="professor",
        full_name="Dr. Jones",
        employee_id="EMP-002",
        department_id=data["department"].id,
    )
    professor_headers = login_headers(client, "second.prof@university.edu", "Professor123!")
    second_professor = db_session.query(Professor).filter_by(employee_id="EMP-002").one()

    faculty = client.get("/api/v1/admin/faculty", headers=headers)
    assert faculty.status_code == 200, faculty.text
    assert faculty.json()["total"] == 2
    smith = next(item for item in faculty.json()["items"] if item["employee_id"] == "EMP-001")
    assert smith["class_count"] == 1

    assigned = client.post(
        f"/api/v1/admin/classes/{data['class'].id}/professors/{second_professor.id}",
        headers=headers,
    )
    assert assigned.status_code == 201, assigned.text
    assert assigned.json()["semester"] == "Fall 2026"

    assignments = client.get(
        f"/api/v1/admin/classes/{data['class'].id}/professors", headers=headers
    )
    assert assignments.status_code == 200, assignments.text
    assert len(assignments.json()) == 1
    assert assignments.json()[0]["professor_id"] == second_professor.id

    professor_classes = client.get(
        "/api/v1/professor/classes",
        headers=professor_headers,
        params={"semester_id": data["semester"].id},
    )
    assert professor_classes.status_code == 200, professor_classes.text
    assert professor_classes.json()["total"] == 1

    duplicate = client.post(
        f"/api/v1/admin/classes/{data['class'].id}/professors/{second_professor.id}",
        headers=headers,
    )
    assert duplicate.status_code == 409

    unassigned = client.delete(
        f"/api/v1/admin/classes/{data['class'].id}/professors/{second_professor.id}",
        headers=headers,
    )
    assert unassigned.status_code == 204

    after = client.get(
        f"/api/v1/admin/classes/{data['class'].id}/professors", headers=headers
    )
    assert after.json() == []


def test_class_creation_rejects_missing_term_and_semester(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    headers = _admin_headers(client, db_session)

    invalid = client.post(
        "/api/v1/admin/classes",
        headers=headers,
        json={"course_id": data["course"].id, "section": "C"},
    )
    assert invalid.status_code == 422
