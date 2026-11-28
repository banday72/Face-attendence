from __future__ import annotations

from sqlalchemy import select

from app.models import RegistrationInvite, Student, User
from tests.conftest import create_user, login_headers


def _admin_headers(client, db_session):
    create_user(
        db_session,
        email="invite-admin@university.edu",
        password="Admin123!",
        role="admin",
        full_name="Invite Admin",
    )
    db_session.commit()
    return login_headers(client, "invite-admin@university.edu", "Admin123!")


def test_student_can_register_with_single_use_invite(client, db_session):
    headers = _admin_headers(client, db_session)
    created = client.post(
        "/api/v1/admin/invites",
        headers=headers,
        json={
            "email": "invited.student@university.edu",
            "full_name": "Invited Student",
            "university_id": "STU-INV-001",
            "program": "Computer Science",
            "year_level": 2,
        },
    )
    assert created.status_code == 201, created.text
    invite_data = created.json()
    token = invite_data["token"]
    assert invite_data["url"].endswith(f"/join/{token}")
    assert invite_data["status"] == "pending"

    details = client.get(f"/api/v1/auth/invites/{token}")
    assert details.status_code == 200, details.text
    assert details.json()["full_name"] == "Invited Student"
    assert details.json()["university_id"] == "STU-INV-001"

    registered = client.post(
        "/api/v1/auth/register-with-invite",
        json={"token": token, "password": "Student123!"},
    )
    assert registered.status_code == 200, registered.text
    payload = registered.json()
    assert payload["access_token"]
    assert payload["user"]["role"] == "student"
    assert payload["user"]["university_id"] == "STU-INV-001"
    assert "refresh_token" in registered.cookies

    user = db_session.scalar(select(User).where(User.email == "invited.student@university.edu"))
    student = db_session.scalar(select(Student).where(Student.university_id == "STU-INV-001"))
    invite = db_session.scalar(select(RegistrationInvite).where(RegistrationInvite.id == invite_data["id"]))
    assert user is not None
    assert student is not None and student.user_id == user.id
    assert invite is not None and invite.used_at is not None

    reused = client.post(
        "/api/v1/auth/register-with-invite",
        json={"token": token, "password": "Student123!"},
    )
    assert reused.status_code == 410
    assert "already been used" in reused.json()["error"]["message"]


def test_admin_can_revoke_invite(client, db_session):
    headers = _admin_headers(client, db_session)
    created = client.post(
        "/api/v1/admin/invites",
        headers=headers,
        json={
            "email": "revoked.student@university.edu",
            "full_name": "Revoked Student",
            "university_id": "STU-INV-002",
        },
    )
    assert created.status_code == 201, created.text
    invite_id = created.json()["id"]
    token = created.json()["token"]

    revoked = client.post(f"/api/v1/admin/invites/{invite_id}/revoke", headers=headers)
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["status"] == "revoked"

    details = client.get(f"/api/v1/auth/invites/{token}")
    assert details.status_code == 410
    assert "revoked" in details.json()["error"]["message"]


def test_unknown_invite_returns_not_found(client, db_session):
    response = client.get("/api/v1/auth/invites/not-a-real-invite-token-1234567890")
    assert response.status_code == 404
