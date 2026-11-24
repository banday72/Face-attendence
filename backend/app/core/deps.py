from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import AttendanceSession, Class_, Professor, Student, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

DB_Dependency = Annotated[Session, Depends(get_db)]


def get_db_session() -> Iterator[Session]:
    yield from get_db()


def get_current_user(db: Session = Depends(get_db), token: str | None = Depends(oauth2_scheme)) -> User:
    if not token:
        raise AppError(401, "unauthenticated", "Authentication credentials were not provided")
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError as exc:
        raise AppError(401, "session_expired", "Access token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AppError(401, "unauthenticated", "Invalid access token") from exc
    user = db.get(User, str(payload["sub"]))
    if user is None or not user.is_active:
        raise AppError(401, "unauthenticated", "User account is inactive or no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise AppError(403, "forbidden", "Administrator access is required")
    return user


def require_professor(user: User = Depends(get_current_user)) -> User:
    if user.role != "professor":
        raise AppError(403, "forbidden", "Professor access is required")
    return user


def require_student(user: User = Depends(get_current_user)) -> User:
    if user.role != "student":
        raise AppError(403, "forbidden", "Student access is required")
    return user


def require_professor_or_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"professor", "admin"}:
        raise AppError(403, "forbidden", "Professor or administrator access is required")
    return user


def student_profile(db: Session, user: User) -> Student:
    profile = db.query(Student).filter(Student.user_id == user.id).one_or_none()
    if profile is None:
        raise AppError(404, "not_found", "Student profile not found")
    return profile


def professor_profile(db: Session, user: User) -> Professor:
    profile = db.query(Professor).filter(Professor.user_id == user.id).one_or_none()
    if profile is None:
        raise AppError(404, "not_found", "Professor profile not found")
    return profile


def assert_professor_owns_class(db: Session, user: User, class_id: str) -> Class_:
    class_ = db.get(Class_, class_id)
    if class_ is None:
        raise AppError(404, "not_found", "Class not found")
    if user.role == "admin":
        return class_
    if user.role != "professor":
        raise AppError(403, "forbidden", "Only the assigned professor or an administrator may perform this action")
    profile = professor_profile(db, user)
    if class_.professor_id != profile.id:
        raise AppError(403, "forbidden", "You are not assigned to this class")
    return class_


def assert_professor_owns_session(db: Session, user: User, session_id: str) -> AttendanceSession:
    session = db.get(AttendanceSession, session_id)
    if session is None:
        raise AppError(404, "not_found", "Session not found")
    assert_professor_owns_class(db, user, session.class_id)
    return session


def assert_student_enrolled(db: Session, student: Student, class_id: str) -> None:
    from app.models import Enrollment

    enrollment = (
        db.query(Enrollment)
        .filter(
            Enrollment.student_id == student.id,
            Enrollment.class_id == class_id,
            Enrollment.status == "enrolled",
        )
        .one_or_none()
    )
    if enrollment is None:
        raise AppError(403, "forbidden", "You are not enrolled in this class")


def client_ip(request: Request) -> str | None:
    peer_ip = request.client.host if request.client else None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and peer_ip in settings.trusted_proxy_ip_set:
        return forwarded.split(",")[0].strip()
    return peer_ip


def refresh_cookie_max_age() -> int:
    return settings.refresh_token_expire_days * 24 * 60 * 60
