from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.config import settings
from app.core.deps import (
    DB_Dependency,
    get_current_user,
    refresh_cookie_max_age,
)
from app.core.errors import AppError
from app.core.rate_limit import login_limit, refresh_limit, register_limit
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    refresh_token_expiry,
    verify_password,
)
from app.models import Professor, RefreshToken, Student, User
from app.schemas.auth import AccessTokenOut, LoginIn, MeOut, RegisterIn, Role, UserOut
from app.utils.uuid import new_uuid, utcnow

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


def _issue_refresh_token(db: Session, user: User) -> str:
    refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            id=new_uuid(),
            user_id=user.id,
            token_hash=hash_token(refresh),
            expires_at=refresh_token_expiry(),
            created_at=utcnow(),
        )
    )
    db.flush()
    return refresh


def _access_token_out(user: User) -> AccessTokenOut:
    return AccessTokenOut(
        access_token=create_access_token(user.id, user.role),
        expires_in=settings.access_token_expire_minutes * 60,
    )


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=refresh_cookie_max_age(),
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        path="/api/v1/auth",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@register_limit
def register(payload: RegisterIn, request: Request, response: Response, db: DB_Dependency) -> User:
    exists = db.scalar(select(User).where(User.email == payload.email.lower()))
    if exists is not None:
        raise AppError(409, "conflict", "An account with this email already exists")
    if db.scalar(select(Student).where(Student.university_id == payload.university_id)):
        raise AppError(409, "conflict", "University ID is already registered")

    user = User(
        id=new_uuid(),
        email=str(payload.email).lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role="student",
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(user)
    db.flush()
    student = Student(
        id=new_uuid(),
        user_id=user.id,
        university_id=payload.university_id,
        program=payload.program,
        year_level=payload.year_level,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(student)
    db.flush()
    write_audit_log(
        db,
        action="auth.register",
        entity_type="user",
        entity_id=user.id,
        actor=user,
        after={"email": user.email, "role": user.role, "university_id": student.university_id},
        reason="Student self-registration",
        request=request,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "Account or university ID already exists") from exc
    db.refresh(user)
    return user


@router.post("/login", response_model=AccessTokenOut)
@login_limit
def login(payload: LoginIn, request: Request, response: Response, db: DB_Dependency) -> AccessTokenOut:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise AppError(401, "unauthenticated", "Invalid email or password")
    if not user.is_active:
        raise AppError(403, "forbidden", "Account is disabled")
    refresh = _issue_refresh_token(db, user)
    access = _access_token_out(user)
    db.commit()
    _set_refresh_cookie(response, refresh)
    return access


@router.post("/refresh", response_model=AccessTokenOut)
@refresh_limit
def refresh(request: Request, response: Response, db: DB_Dependency) -> AccessTokenOut:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise AppError(401, "unauthenticated", "Refresh cookie is missing")
    token_hash = hash_token(token)
    now = utcnow()
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if stored is None or stored.expires_at <= now:
        raise AppError(401, "unauthenticated", "Refresh token is invalid or expired")
    if stored.revoked_at is not None:
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == stored.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        raise AppError(401, "unauthenticated", "Refresh token is invalid or expired")

    user = db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise AppError(401, "unauthenticated", "User account is inactive")

    revoked_result = cast(Any, db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.id == stored.id,
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    ))
    revoked = int(getattr(revoked_result, "rowcount", 0) or 0)
    if revoked != 1:
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == stored.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        raise AppError(401, "unauthenticated", "Refresh token is invalid or expired")

    refresh_token = _issue_refresh_token(db, user)
    access = _access_token_out(user)
    db.commit()
    _set_refresh_cookie(response, refresh_token)
    return access


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: DB_Dependency) -> Response:
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = utcnow()
            db.commit()
    response.delete_cookie(key=REFRESH_COOKIE, path="/api/v1/auth")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=MeOut)
def me(db: DB_Dependency, user: User = Depends(get_current_user)) -> MeOut:
    student = db.scalar(select(Student).where(Student.user_id == user.id))
    professor = db.scalar(select(Professor).where(Professor.user_id == user.id))
    department_id = None
    department_name = None
    if student and student.department:
        department_id = student.department_id
        department_name = student.department.name
    elif professor and professor.department:
        department_id = professor.department_id
        department_name = professor.department.name
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=cast(Role, user.role),
        is_active=user.is_active,
        phone=user.phone,
        created_at=user.created_at,
        university_id=student.university_id if student else None,
        program=student.program if student else None,
        year_level=student.year_level if student else None,
        employee_id=professor.employee_id if professor else None,
        department_id=department_id,
        department_name=department_name,
    )
