from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.models import BiometricConsent
from app.services import face_service
from app.utils.uuid import utcnow
from tests.conftest import (
    create_academic_data,
    create_session_record,
    create_user,
    login_headers,
    start_session_via_api,
)


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


def frames(identity: str, offsets: tuple[int, ...] = (0, 50, 100)) -> list[str]:
    return [f"data:image/jpeg;base64,{identity}@{offset}" for offset in offsets]


def test_face_registration_liveness_duplicate_and_status(
    client: TestClient, db_session: Session, fake_face_engine: None
) -> None:
    create_user(db_session, email="facea@university.edu", password="Student123!", role="student", university_id="FACE-A")
    create_user(db_session, email="faceb@university.edu", password="Student123!", role="student", university_id="FACE-B")
    create_user(db_session, email="facec@university.edu", password="Student123!", role="student", university_id="FACE-C")
    headers_a = login_headers(client, "facea@university.edu", "Student123!")
    headers_b = login_headers(client, "faceb@university.edu", "Student123!")
    headers_c = login_headers(client, "facec@university.edu", "Student123!")

    payload_a = {"consent_version": settings.biometric_consent_version, "frames": frames("a")}
    registered = client.post("/api/v1/face/register", headers=headers_a, json=payload_a)
    assert registered.status_code == 201, registered.text
    assert registered.json()["embedding_count"] == 3

    status = client.get("/api/v1/face/status", headers=headers_a)
    assert status.status_code == 200
    assert status.json()["is_registered"] is True
    assert status.json()["embedding_count"] == 3

    duplicate = client.post("/api/v1/face/register", headers=headers_b, json=payload_a)
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "conflict"

    registered_b = client.post(
        "/api/v1/face/register",
        headers=headers_b,
        json={"consent_version": settings.biometric_consent_version, "frames": frames("b")},
    )
    assert registered_b.status_code == 201, registered_b.text

    no_movement = client.post(
        "/api/v1/face/register",
        headers=headers_c,
        json={"consent_version": settings.biometric_consent_version, "frames": frames("c", (0, 0, 0))},
    )
    assert no_movement.status_code == 422
    assert no_movement.json()["error"]["code"] == "face_verification_failed"
    assert no_movement.json()["error"]["details"]["liveness"] == "insufficient_movement"

    too_few = client.post(
        "/api/v1/face/register",
        headers=headers_c,
        json={"consent_version": settings.biometric_consent_version, "frames": frames("c", (0, 50))},
    )
    assert too_few.status_code == 422

    deleted = client.delete("/api/v1/face/me", headers=headers_a)
    assert deleted.status_code == 204
    status_after = client.get("/api/v1/face/status", headers=headers_a)
    assert status_after.json()["is_registered"] is False
    assert status_after.json()["requires_new_consent"] is True


def test_face_check_in_with_liveness_challenge(
    client: TestClient, db_session: Session, fake_face_engine: None
) -> None:
    data = create_academic_data(db_session)
    student_id = data["enrolled"].id
    session = create_session_record(db_session, data, require_face=True, require_location=False, challenge="turn_left")
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")

    registered = client.post(
        "/api/v1/face/register",
        headers=student_headers,
        json={"consent_version": settings.biometric_consent_version, "frames": frames("a")},
    )
    assert registered.status_code == 201, registered.text

    start_session_via_api(client, session.id, professor_headers)
    wrong_challenge = client.post(
        "/api/v1/attendance/face",
        headers=student_headers,
        json={"session_id": session.id, "frames": frames("a"), "challenge": "blink"},
    )
    assert wrong_challenge.status_code == 403
    assert wrong_challenge.json()["error"]["code"] == "face_verification_failed"

    checked_in = client.post(
        "/api/v1/attendance/face",
        headers=student_headers,
        json={"session_id": session.id, "frames": frames("a"), "challenge": "turn_left"},
    )
    assert checked_in.status_code == 201, checked_in.text
    assert checked_in.json()["method"] == "face"
    assert checked_in.json()["face_status"] == "verified"
    assert checked_in.json()["student_id"] == student_id


def test_face_check_in_requires_active_current_consent(
    client: TestClient, db_session: Session, fake_face_engine: None
) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data, require_face=True, require_location=False, challenge="turn_left")
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    registered = client.post(
        "/api/v1/face/register",
        headers=student_headers,
        json={"consent_version": settings.biometric_consent_version, "frames": frames("a")},
    )
    assert registered.status_code == 201
    start_session_via_api(client, session.id, professor_headers)

    consent = db_session.scalar(select(BiometricConsent).where(BiometricConsent.student_id == data["enrolled"].id))
    assert consent is not None
    consent.is_active = False
    consent.revoked_at = utcnow()
    db_session.commit()

    response = client.post(
        "/api/v1/attendance/face",
        headers=student_headers,
        json={"session_id": session.id, "frames": frames("a"), "challenge": "turn_left"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "face_consent_required"


def test_face_check_in_enforces_location_when_required(
    client: TestClient, db_session: Session, fake_face_engine: None
) -> None:
    data = create_academic_data(db_session)
    session = create_session_record(db_session, data, require_face=True, require_location=True, challenge="turn_left")
    professor_headers = login_headers(client, "prof@university.edu", "Professor123!")
    student_headers = login_headers(client, "enrolled@university.edu", "Student123!")
    registered = client.post(
        "/api/v1/face/register",
        headers=student_headers,
        json={"consent_version": settings.biometric_consent_version, "frames": frames("a")},
    )
    assert registered.status_code == 201
    start_session_via_api(client, session.id, professor_headers)

    missing_location = client.post(
        "/api/v1/attendance/face",
        headers=student_headers,
        json={"session_id": session.id, "frames": frames("a"), "challenge": "turn_left"},
    )
    assert missing_location.status_code == 422

    ok = client.post(
        "/api/v1/attendance/face",
        headers=student_headers,
        json={
            "session_id": session.id,
            "frames": frames("a"),
            "challenge": "turn_left",
            "latitude": 37.7749,
            "longitude": -122.4194,
            "accuracy": 5.0,
        },
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["location_status"] == "verified"


def test_face_model_retry_after_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    face_service._face_app = None
    face_service._face_app_error = "boom"
    face_service._face_app_error_at = utcnow().timestamp() - 31

    calls = {"count": 0}

    class DummyApp:
        def prepare(self, ctx_id: int, det_size: tuple[int, int]) -> None:
            return None

    class DummyFaceAnalysis:
        def __init__(self, name: str, providers: list[str]) -> None:
            calls["count"] += 1

        def prepare(self, ctx_id: int, det_size: tuple[int, int]) -> None:
            return None

    import sys
    import types

    fake_insightface = types.ModuleType("insightface")
    fake_app_module = types.ModuleType("insightface.app")
    fake_app_module.FaceAnalysis = DummyFaceAnalysis
    fake_insightface.app = fake_app_module
    monkeypatch.setitem(sys.modules, "insightface", fake_insightface)
    monkeypatch.setitem(sys.modules, "insightface.app", fake_app_module)

    app = face_service.get_face_app()
    assert app is not None
    assert calls["count"] == 1

    face_service._face_app = None
    face_service._face_app_error = "boom"
    face_service._face_app_error_at = utcnow().timestamp()
    with pytest.raises(AppError):
        face_service.get_face_app()
