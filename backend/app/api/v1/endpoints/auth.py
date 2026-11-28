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
from app.core.rate_limit import (
    invite_lookup_limit,
    login_limit,
    refresh_limit,
    register_limit,
)
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    refresh_token_expiry,
    verify_password,
)
from app.models import (
    Department,
    Professor,
    RefreshToken,
    RegistrationInvite,
    Student,
    User,
)
from app.schemas.auth import (
    AccessTokenOut,
    AuthOut,
    InviteDetailsOut,
    InviteRegisterIn,
    LoginIn,
    MeOut,
    ProfessorRegisterIn,
    PublicDepartmentOut,
    RegisterIn,
    RegistrationOptionsOut,
    Role,
    UserOut,
)
from app.services import invite_service
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


def _me_out(db: Session, user: User) -> MeOut:
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


def _auth_out(db: Session, user: User) -> AuthOut:
    access = _access_token_out(user)
    return AuthOut(
        access_token=access.access_token,
        token_type=access.token_type,
        expires_in=access.expires_in,
        user=_me_out(db, user),
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


@router.get("/registration-options", response_model=RegistrationOptionsOut)
def registration_options(db: DB_Dependency) -> RegistrationOptionsOut:
    departments = db.scalars(select(Department).order_by(Department.name)).all()
    return RegistrationOptionsOut(
        departments=[PublicDepartmentOut.model_validate(department) for department in departments]
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@register_limit
def register(payload: RegisterIn, request: Request, response: Response, db: DB_Dependency) -> User:
    exists = db.scalar(select(User).where(User.email == payload.email.lower()))
    if exists is not None:
        raise AppError(409, "conflict", "An account with this email already exists")
    if db.scalar(select(Student).where(Student.university_id == payload.university_id)):
        raise AppError(409, "conflict", "University ID is already registered")
    department = db.get(Department, payload.department_id) if payload.department_id else None
    if payload.department_id and department is None:
        raise AppError(404, "not_found", "Department not found")

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
        department_id=department.id if department else None,
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
        after={
            "email": user.email,
            "role": user.role,
            "university_id": student.university_id,
            "department_id": student.department_id,
        },
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


@router.post("/register-professor", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@register_limit
def register_professor(
    payload: ProfessorRegisterIn, request: Request, response: Response, db: DB_Dependency
) -> User:
    email = str(payload.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AppError(409, "conflict", "An account with this email already exists")
    if db.scalar(select(Professor).where(Professor.employee_id == payload.employee_id)):
        raise AppError(409, "conflict", "Employee ID is already registered")
    department = db.get(Department, payload.department_id) if payload.department_id else None
    if payload.department_id and department is None:
        raise AppError(404, "not_found", "Department not found")

    now = utcnow()
    user = User(
        id=new_uuid(),
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role="professor",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.flush()
    professor = Professor(
        id=new_uuid(),
        user_id=user.id,
        employee_id=payload.employee_id,
        department_id=department.id if department else None,
        title=payload.title,
        office=payload.office,
        created_at=now,
        updated_at=now,
    )
    db.add(professor)
    db.flush()
    write_audit_log(
        db,
        action="auth.register_professor",
        entity_type="user",
        entity_id=user.id,
        actor=user,
        after={
            "email": user.email,
            "role": user.role,
            "employee_id": professor.employee_id,
            "department_id": professor.department_id,
        },
        reason="Professor self-registration",
        request=request,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "Account or employee ID already exists") from exc
    db.refresh(user)
    return user


@router.get("/invites/{token}", response_model=InviteDetailsOut)
@invite_lookup_limit
def get_invite(token: str, request: Request, db: DB_Dependency) -> InviteDetailsOut:
    invite = invite_service.get_pending_invite(db, token)
    department = db.get(Department, invite.department_id) if invite.department_id else None
    return InviteDetailsOut(
        full_name=invite.full_name,
        email=invite.email,
        university_id=invite.university_id,
        program=invite.program,
        year_level=invite.year_level,
        department_id=invite.department_id,
        department_name=department.name if department else None,
        expires_at=invite.expires_at,
    )


@router.post("/register-with-invite", response_model=AuthOut)
@register_limit
def register_with_invite(
    payload: InviteRegisterIn, request: Request, response: Response, db: DB_Dependency
) -> AuthOut:
    invite = invite_service.get_pending_invite(db, payload.token)
    email = invite.email.lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise AppError(409, "conflict", "An account with this email already exists")
    if db.scalar(select(Student).where(Student.university_id == invite.university_id)) is not None:
        raise AppError(409, "conflict", "University ID is already registered")

    now = utcnow()
    claimed = db.execute(
        update(RegistrationInvite)
        .where(
            RegistrationInvite.id == invite.id,
            RegistrationInvite.used_at.is_(None),
            RegistrationInvite.revoked_at.is_(None),
            RegistrationInvite.expires_at > now,
        )
        .values(used_at=now)
    )
    if int(getattr(claimed, "rowcount", 0) or 0) != 1:
        db.rollback()
        raise AppError(409, "conflict", "This invite link is no longer available")

    user = User(
        id=new_uuid(),
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=invite.full_name,
        role="student",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.flush()
    db.add(
        Student(
            id=new_uuid(),
            user_id=user.id,
            university_id=invite.university_id,
            department_id=invite.department_id,
            program=invite.program,
            year_level=invite.year_level,
            created_at=now,
            updated_at=now,
        )
    )
    db.flush()
    refresh = _issue_refresh_token(db, user)
    auth = _auth_out(db, user)
    write_audit_log(
        db,
        action="auth.register_with_invite",
        entity_type="user",
        entity_id=user.id,
        actor=user,
        after={
            "email": user.email,
            "role": user.role,
            "university_id": invite.university_id,
            "invite_id": invite.id,
        },
        reason="Student invite registration",
        request=request,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "Account or university ID already exists") from exc
    _set_refresh_cookie(response, refresh)
    return auth


@router.post("/login", response_model=AuthOut)
@login_limit
def login(payload: LoginIn, request: Request, response: Response, db: DB_Dependency) -> AuthOut:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise AppError(401, "unauthenticated", "Invalid email or password")
    if not user.is_active:
        raise AppError(403, "forbidden", "Account is disabled")
    refresh = _issue_refresh_token(db, user)
    auth = _auth_out(db, user)
    db.commit()
    _set_refresh_cookie(response, refresh)
    return auth


@router.post("/refresh", response_model=AuthOut)
@refresh_limit
def refresh(request: Request, response: Response, db: DB_Dependency) -> AuthOut:
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
    auth = _auth_out(db, user)
    db.commit()
    _set_refresh_cookie(response, refresh_token)
    return auth


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
    return _me_out(db, user)
