from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import face_service
from tests.conftest import create_academic_data, create_user, login_headers


@pytest.fixture()
def fake_face_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    def decode(frame: str) -> str:
        return frame

    def detect(image: str) -> list[face_service.FaceDetection]:
        label = image.rsplit(",", 1)[1]
        identity, offset_text = label.split("@")
        vector = np.array([1.0, 0.0] if identity == "a" else [0.0, 1.0], dtype=np.float32)
        center = float(offset_text)
        return [face_service.FaceDetection(embedding=vector, bbox=(center - 10, 0, center + 10, 20))]

    monkeypatch.setattr(face_service, "decode_frame", decode)
    monkeypatch.setattr(face_service, "detect_faces", detect)


def test_admin_timetable_crud_and_student_view(client: TestClient, db_session: Session) -> None:
    data = create_academic_data(db_session)
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin")
    admin_headers = login_headers(client, "admin@university.edu", "Admin123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")

    created = client.post(
        "/api/v1/admin/schedules",
        headers=admin_headers,
        json={
            "class_id": data["class"].id,
            "classroom_id": data["classroom"].id,
            "day_of_week": 0,
            "start_time": "09:00:00",
            "end_time": "10:30:00",
        },
    )
    assert created.status_code == 201, created.text
    schedule_id = created.json()["id"]
    assert created.json()["day_of_week"] == 0

    listed = client.get(
        "/api/v1/admin/schedules", headers=admin_headers, params={"class_id": data["class"].id}
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    student_view = client.get("/api/v1/student/schedule", headers=student_headers)
    assert student_view.status_code == 200, student_view.text
    item = student_view.json()["items"][0]
    assert item["day_name"] == "Mon"
    assert item["class_id"] == data["class"].id

    updated = client.patch(
        f"/api/v1/admin/schedules/{schedule_id}",
        headers=admin_headers,
        json={"start_time": "14:00:00", "end_time": "15:30:00"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["start_time"] == "14:00:00"

    deleted = client.delete(f"/api/v1/admin/schedules/{schedule_id}", headers=admin_headers)
    assert deleted.status_code == 204


def test_admin_timetable_rejects_invalid_input_and_duplicates(
    client: TestClient, db_session: Session
) -> None:
    data = create_academic_data(db_session)
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin")
    admin_headers = login_headers(client, "admin@university.edu", "Admin123!")
    payload = {
        "class_id": data["class"].id,
        "day_of_week": 2,
        "start_time": "09:00:00",
        "end_time": "08:00:00",
    }
    invalid = client.post("/api/v1/admin/schedules", headers=admin_headers, json=payload)
    assert invalid.status_code == 422

    valid = {**payload, "end_time": "10:30:00"}
    first = client.post("/api/v1/admin/schedules", headers=admin_headers, json=valid)
    assert first.status_code == 201, first.text
    duplicate = client.post("/api/v1/admin/schedules", headers=admin_headers, json=valid)
    assert duplicate.status_code == 409


def test_admin_registers_student_face_with_consent(
    client: TestClient, db_session: Session, fake_face_engine: None
) -> None:
    data = create_academic_data(db_session)
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin")
    admin_headers = login_headers(client, "admin@university.edu", "Admin123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    student_id = data["enrolled"].id
    frames = [f"data:image/jpeg;base64,a@{offset}" for offset in (0, 50, 100)]

    forbidden = client.post(
        f"/api/v1/admin/face/register/{student_id}",
        headers=student_headers,
        json={
            "consent_version": settings.biometric_consent_version,
            "frames": frames,
            "consent_confirmed": True,
            "consent_reference": "FORM-1",
        },
    )
    assert forbidden.status_code == 403

    rejected = client.post(
        f"/api/v1/admin/face/register/{student_id}",
        headers=admin_headers,
        json={
            "consent_version": settings.biometric_consent_version,
            "frames": frames,
            "consent_confirmed": False,
            "consent_reference": "FORM-1",
        },
    )
    assert rejected.status_code == 422

    registered = client.post(
        f"/api/v1/admin/face/register/{student_id}",
        headers=admin_headers,
        json={
            "consent_version": settings.biometric_consent_version,
            "frames": frames,
            "consent_confirmed": True,
            "consent_reference": "FORM-1",
        },
    )
    assert registered.status_code == 201, registered.text
    assert registered.json()["embedding_count"] == 3

    status = client.get(f"/api/v1/admin/face/status/{student_id}", headers=admin_headers)
    assert status.status_code == 200
    assert status.json()["is_registered"] is True

    logs = client.get(
        "/api/v1/admin/audit-logs", headers=admin_headers, params={"action": "face.register_admin"}
    )
    assert logs.status_code == 200
    assert logs.json()["total"] >= 1


def test_admin_face_endpoints_accept_user_id(
    client: TestClient, db_session: Session, fake_face_engine: None
) -> None:
    data = create_academic_data(db_session)
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin")
    admin_headers = login_headers(client, "admin@university.edu", "Admin123!")
    user_id = data["enrolled_user"].id
    frames = [f"data:image/jpeg;base64,a@{offset}" for offset in (0, 50, 100)]

    status = client.get(f"/api/v1/admin/face/status/{user_id}", headers=admin_headers)
    assert status.status_code == 200, status.text
    assert status.json()["is_registered"] is False

    registered = client.post(
        f"/api/v1/admin/face/register/{user_id}",
        headers=admin_headers,
        json={
            "consent_version": settings.biometric_consent_version,
            "frames": frames,
            "consent_confirmed": True,
            "consent_reference": "FORM-USER-ID",
        },
    )
    assert registered.status_code == 201, registered.text

    after = client.get(f"/api/v1/admin/face/status/{user_id}", headers=admin_headers)
    assert after.status_code == 200, after.text
    assert after.json()["is_registered"] is True
