from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import DEFAULT_FACE_ENCRYPTION_KEY, DEFAULT_JWT_SECRET, Settings
from app.core.security import hash_token
from app.models import RefreshToken, User
from app.utils.uuid import utcnow
from tests.conftest import (
    create_user,
    login_headers,
)


def test_public_health_and_auth_flow(client: TestClient, db_session: Session) -> None:
    assert client.get("/api/v1/health").json()["status"] == "ok"

    registration = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new.student@university.edu",
            "password": "Student123!",
            "full_name": "New Student",
            "university_id": "STU-NEW",
            "program": "BSc CS",
            "year_level": 1,
        },
    )
    assert registration.status_code == 201, registration.text
    assert registration.json()["role"] == "student"

    duplicate = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new.student@university.edu",
            "password": "Student123!",
            "full_name": "New Student",
            "university_id": "STU-OTHER",
        },
    )
    assert duplicate.status_code == 409

    bad_login = client.post(
        "/api/v1/auth/login", json={"email": "new.student@university.edu", "password": "Wrong123!"}
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["error"]["code"] == "unauthenticated"

    login = client.post(
        "/api/v1/auth/login", json={"email": "new.student@university.edu", "password": "Student123!"}
    )
    assert login.status_code == 200
    assert "refresh_token" not in login.json()
    assert "refresh_token" in login.cookies
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "new.student@university.edu"
    assert me.json()["university_id"] == "STU-NEW"


def test_role_guards_on_admin_endpoints(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="guard.student@university.edu", password="Student123!", role="student")
    student_headers = login_headers(client, "guard.student@university.edu", "Student123!")

    denied = client.get("/api/v1/admin/departments", headers=student_headers)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "forbidden"

    create_user(db_session, email="guard.admin@university.edu", password="Admin123!", role="admin", full_name="Admin")
    admin_headers = login_headers(client, "guard.admin@university.edu", "Admin123!")
    allowed = client.get("/api/v1/admin/departments", headers=admin_headers)
    assert allowed.status_code == 200
    assert allowed.json()["page"] == 1
    assert "items" in allowed.json()

    unauthenticated = client.get("/api/v1/admin/dashboard")
    assert unauthenticated.status_code == 401


def test_refresh_replay_revokes_user_tokens(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="refresh@university.edu", password="Student123!", role="student", university_id="REF-1")
    login = client.post("/api/v1/auth/login", json={"email": "refresh@university.edu", "password": "Student123!"})
    assert login.status_code == 200
    old_cookie = login.cookies.get("refresh_token")
    assert old_cookie

    first_refresh = client.post("/api/v1/auth/refresh")
    assert first_refresh.status_code == 200
    assert "refresh_token" not in first_refresh.json()
    new_cookie = first_refresh.cookies.get("refresh_token")
    assert new_cookie and new_cookie != old_cookie

    client.cookies.set("refresh_token", old_cookie, path="/api/v1/auth")
    replay = client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401

    client.cookies.set("refresh_token", new_cookie, path="/api/v1/auth")
    after_replay = client.post("/api/v1/auth/refresh")
    assert after_replay.status_code == 401

    tokens = db_session.scalars(select(RefreshToken).where(RefreshToken.revoked_at.is_(None))).all()
    assert tokens == []


def test_refresh_rotation_is_atomic_under_race(client: TestClient, db_session: Session) -> None:
    user = create_user(
        db_session, email="race@university.edu", password="Student123!", role="student", university_id="RACE-1"
    )
    login = client.post("/api/v1/auth/login", json={"email": "race@university.edu", "password": "Student123!"})
    assert login.status_code == 200
    token = login.cookies.get("refresh_token")
    assert token
    token_hash = hash_token(token)

    first = db_session.execute(
        RefreshToken.__table__.update()
        .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    assert first.rowcount == 1
    db_session.commit()

    client.cookies.set("refresh_token", token, path="/api/v1/auth")
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 401

    active = db_session.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    ).all()
    assert active == []


def test_academic_endpoints_require_authentication(client: TestClient) -> None:
    for path in ["/api/v1/departments", "/api/v1/courses", "/api/v1/classrooms"]:
        response = client.get(path)
        assert response.status_code == 401


def test_secret_validation_allows_dev_defaults_only_with_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("FACE_ENCRYPTION_KEY", raising=False)
    with pytest.raises(ValueError):
        Settings(environment="development", allow_dev_secrets=False, _env_file=None)
    allowed = Settings(environment="development", allow_dev_secrets=True, _env_file=None)
    assert allowed.allow_dev_secrets is True
    with pytest.raises(ValueError):
        Settings(
            environment="staging",
            allow_dev_secrets=True,
            jwt_secret=DEFAULT_JWT_SECRET,
            face_encryption_key=DEFAULT_FACE_ENCRYPTION_KEY,
            _env_file=None,
        )


def test_password_validation_utf8_bytes_and_user_update_noop(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="admin@university.edu", password="Admin123!", role="admin", full_name="Admin")
    admin_headers = login_headers(client, "admin@university.edu", "Admin123!")
    create_user(db_session, email="target@university.edu", password="Student123!", role="student", university_id="TGT-1")
    user = db_session.scalar(select(User).where(User.email == "target@university.edu"))
    assert user is not None

    too_long = "A" * 69 + "a1😀"
    assert len(too_long.encode("utf-8")) > 72
    bad = client.post(
        "/api/v1/auth/register",
        json={
            "email": "bytes@university.edu",
            "password": too_long,
            "full_name": "Bytes User",
            "university_id": "STU-BYTES",
        },
    )
    assert bad.status_code == 422

    before = user.hashed_password
    updated = client.patch(f"/api/v1/admin/users/{user.id}", headers=admin_headers, json={"password": None, "full_name": "Target Name"})
    assert updated.status_code == 200
    db_session.refresh(user)
    assert user.hashed_password == before
    assert user.full_name == "Target Name"


def test_audit_ip_uses_proxy_header_only_for_trusted_proxy(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    create_user(db_session, email="adminip@university.edu", password="Admin123!", role="admin", full_name="Admin")
    headers = login_headers(client, "adminip@university.edu", "Admin123!")

    monkeypatch.setattr("app.core.config.settings.trusted_proxy_ip_set", set(), raising=False)
    dept = client.post(
        "/api/v1/admin/departments",
        headers={**headers, "x-forwarded-for": "203.0.113.9"},
        json={"name": "IP Dept", "code": "IPD"},
    )
    assert dept.status_code == 201
    db_session.expire_all()
    from app.models import AuditLog

    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "department.create").order_by(AuditLog.created_at.desc()))
    assert log is not None
    assert log.ip_address != "203.0.113.9"

    monkeypatch.setattr("app.core.config.settings.trusted_proxy_ip_set", {"testclient"}, raising=False)
    dept2 = client.post(
        "/api/v1/admin/departments",
        headers={**headers, "x-forwarded-for": "203.0.113.10"},
        json={"name": "IP Dept2", "code": "IPD2"},
    )
    assert dept2.status_code == 201
    db_session.expire_all()
    log2 = db_session.scalar(select(AuditLog).where(AuditLog.action == "department.create", AuditLog.entity_id == dept2.json()["id"]))
    assert log2 is not None
    assert log2.ip_address == "203.0.113.10"
