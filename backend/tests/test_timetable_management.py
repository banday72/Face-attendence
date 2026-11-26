from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import create_academic_data, create_user, login_headers


def _admin(client: TestClient, db: Session) -> dict[str, str]:
    create_user(db, email="admin@university.edu", password="Admin123!", role="admin")
    return login_headers(client, "admin@university.edu", "Admin123!")


def _semester(client: TestClient, headers: dict[str, str], start: date, end: date) -> str:
    response = client.post(
        "/api/v1/admin/semesters",
        headers=headers,
        json={
            "name": "Semester 1 2026",
            "code": "S1-2026",
            "number": 1,
            "academic_year": "2026",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _schedule(
    client: TestClient,
    headers: dict[str, str],
    data: dict[str, object],
    **overrides: object,
) -> object:
    payload: dict[str, object] = {
        "class_id": data["class"].id,
        "course_id": data["course"].id,
        "department_id": data["department"].id,
        "professor_id": data["professor"].id,
        "classroom_id": data["classroom"].id,
        "days_of_week": [0, 2],
        "start_time": "09:00:00",
        "end_time": "10:30:00",
        "class_type": "Lecture",
        "notes": "Weekly lecture",
        "recurrence_type": "weekly",
        **overrides,
    }
    return client.post("/api/v1/admin/timetable/schedules", headers=headers, json=payload)


def test_weekly_schedule_creates_group_and_timetable_entries(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    headers = _admin(client, db_session)
    semester_id = _semester(
        client, headers, date.today() - timedelta(days=30), date.today() + timedelta(days=60)
    )
    created = _schedule(
        client,
        headers,
        data,
        semester_id=semester_id,
        start_date=(date.today() - timedelta(days=date.today().weekday())).isoformat(),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert len(body["items"]) == 2
    assert body["occurrences"] >= 2
    assert body["items"][0]["professor_id"] == data["professor"].id
    assert body["items"][0]["notes"] == "Weekly lecture"

    fetched = client.get(
        f"/api/v1/admin/timetable/schedules/{body['group_id']}", headers=headers
    )
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["group_id"] == body["group_id"]
    assert len(fetched.json()["items"]) == 2

    timetable = client.get(
        "/api/v1/admin/timetable",
        headers=headers,
        params={
            "view": "week",
            "semester_id": semester_id,
            "from_date": (date.today() - timedelta(days=date.today().weekday())).isoformat(),
        },
    )
    assert timetable.status_code == 200, timetable.text
    assert timetable.json()["total"] >= 2
    entry = timetable.json()["items"][0]
    assert entry["course_code"] == "CS101"
    assert entry["professor_name"] == "Dr. Smith"
    assert entry["classroom_name"] == "Lab A"
    assert entry["semester_name"] == "Semester 1 2026"

    summary = client.get("/api/v1/admin/timetable/summary", headers=headers)
    assert summary.status_code == 200, summary.text
    assert summary.json()["total_schedules"] == 2
    assert "Lecture" in summary.json()["by_type"]

    deleted = client.delete(f"/api/v1/admin/timetable/schedules/{body['group_id']}", headers=headers)
    assert deleted.status_code == 204
    assert client.get("/api/v1/admin/timetable", headers=headers).json()["total"] == 0


def test_recurrence_types_generate_expected_dates(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    headers = _admin(client, db_session)
    start = date(2026, 12, 1)
    end = date(2026, 12, 31)

    one_time = _schedule(
        client,
        headers,
        data,
        recurrence_type="one_time",
        start_date=start.isoformat(),
        end_date=start.isoformat(),
        days_of_week=[],
    )
    assert one_time.status_code == 201, one_time.text
    assert one_time.json()["occurrences"] == 1

    daily = _schedule(
        client,
        headers,
        data,
        recurrence_type="daily",
        start_date=date(2026, 12, 1).isoformat(),
        end_date=date(2026, 12, 7).isoformat(),
        days_of_week=[],
        start_time="11:00:00",
        end_time="12:00:00",
        classroom_id=None,
        professor_id=None,
    )
    assert daily.status_code == 201, daily.text
    assert daily.json()["occurrences"] == 7

    custom = _schedule(
        client,
        headers,
        data,
        recurrence_type="custom",
        custom_dates=["2026-12-10", "2026-12-17"],
        days_of_week=[],
        start_time="13:00:00",
        end_time="14:00:00",
        classroom_id=None,
        professor_id=None,
    )
    assert custom.status_code == 201, custom.text
    assert custom.json()["occurrences"] == 2

    monthly = _schedule(
        client,
        headers,
        data,
        recurrence_type="monthly",
        start_date=date(2026, 12, 15).isoformat(),
        end_date=date(2027, 2, 28).isoformat(),
        days_of_week=[],
        start_time="15:00:00",
        end_time="16:00:00",
        classroom_id=None,
        professor_id=None,
    )
    assert monthly.status_code == 201, monthly.text
    assert monthly.json()["occurrences"] == 3

    december = client.get(
        "/api/v1/admin/timetable",
        headers=headers,
        params={"from_date": start.isoformat(), "to_date": end.isoformat()},
    )
    assert december.status_code == 200, december.text
    dates = {item["date"] for item in december.json()["items"]}
    assert "2026-12-01" in dates
    assert "2026-12-10" in dates
    assert len([item for item in december.json()["items"] if item["date"].startswith("2026-12-")]) == 11


def test_conflict_detection_and_permissions(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    headers = _admin(client, db_session)
    start = date(2026, 11, 30)
    end = date(2026, 12, 6)
    semester_id = _semester(client, headers, start, end)

    first = _schedule(
        client,
        headers,
        data,
        semester_id=semester_id,
        recurrence_type="weekly",
        days_of_week=[0],
        start_time="09:00:00",
        end_time="10:30:00",
        start_date=start.isoformat(),
    )
    assert first.status_code == 201, first.text

    teacher_conflict = _schedule(
        client,
        headers,
        data,
        semester_id=semester_id,
        recurrence_type="weekly",
        days_of_week=[0],
        start_time="09:30:00",
        end_time="11:00:00",
        start_date=start.isoformat(),
    )
    assert teacher_conflict.status_code == 409
    assert teacher_conflict.json()["error"]["code"] == "scheduling_conflict"
    assert "already scheduled" in teacher_conflict.json()["error"]["message"]

    check = client.post(
        "/api/v1/admin/schedules/check-conflicts",
        headers=headers,
        json={
            "class_id": data["class"].id,
            "semester_id": semester_id,
            "days_of_week": [0],
            "start_time": "09:30:00",
            "end_time": "11:00:00",
            "recurrence_type": "weekly",
            "start_date": start.isoformat(),
            "professor_id": data["professor"].id,
        },
    )
    assert check.status_code == 200, check.text
    assert check.json()["valid"] is False
    assert any(item["type"] == "teacher" for item in check.json()["conflicts"])
    assert check.json()["occurrence_count"] >= 1

    outside = client.post(
        "/api/v1/admin/schedules/check-conflicts",
        headers=headers,
        json={
            "class_id": data["class"].id,
            "semester_id": semester_id,
            "days_of_week": [0],
            "start_time": "14:00:00",
            "end_time": "15:00:00",
            "recurrence_type": "weekly",
            "start_date": "2027-01-04",
            "professor_id": data["professor"].id,
        },
    )
    assert outside.status_code == 200, outside.text
    assert any(item["type"] == "semester_range" for item in outside.json()["conflicts"])

    list_conflicts = client.get("/api/v1/admin/timetable/conflicts", headers=headers)
    assert list_conflicts.status_code == 200, list_conflicts.text

    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    denied = client.post(
        "/api/v1/admin/timetable/schedules",
        headers=student_headers,
        json={
            "class_id": data["class"].id,
            "days_of_week": [1],
            "start_time": "09:00:00",
            "end_time": "10:00:00",
        },
    )
    assert denied.status_code == 403


def test_classroom_holiday_subject_and_department_management(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    headers = _admin(client, db_session)

    room = client.post(
        "/api/v1/admin/classrooms",
        headers=headers,
        json={
            "name": "Room B-201",
            "building": "Science Block",
            "room": "B-201",
            "room_type": "Laboratory",
            "capacity": 40,
        },
    )
    assert room.status_code == 201, room.text
    room_id = room.json()["id"]
    updated = client.patch(
        f"/api/v1/admin/classrooms/{room_id}", headers=headers, json={"capacity": 55}
    )
    assert updated.status_code == 200
    assert updated.json()["capacity"] == 55

    holiday = client.post(
        "/api/v1/admin/holidays",
        headers=headers,
        json={"name": "University closure", "holiday_date": "2026-12-25"},
    )
    assert holiday.status_code == 201, holiday.text

    subject = client.post(
        "/api/v1/admin/subjects",
        headers=headers,
        json={
            "code": "CS201",
            "name": "Data Structures",
            "credits": 4,
            "department_id": data["department"].id,
            "course_type": "practical",
            "eligible_professor_ids": [data["professor"].id],
        },
    )
    assert subject.status_code == 201, subject.text
    assert subject.json()["eligible_professor_ids"] == [data["professor"].id]

    details = client.get(
        f"/api/v1/admin/departments/{data['department'].id}/details", headers=headers
    )
    assert details.status_code == 200, details.text
    assert len(details.json()["teachers"]) == 1
    assert any(item["code"] == "CS201" for item in details.json()["subjects"])
    assert len(details.json()["classes"]) >= 1

    faculty = client.patch(
        f"/api/v1/admin/faculty/{data['professor'].id}",
        headers=headers,
        json={"title": "Associate Professor", "office": "B-12"},
    )
    assert faculty.status_code == 200, faculty.text
    assert faculty.json()["title"] == "Associate Professor"

    faculty_timetable = client.get(
        f"/api/v1/admin/faculty/{data['professor'].id}/timetable", headers=headers
    )
    assert faculty_timetable.status_code == 200, faculty_timetable.text
