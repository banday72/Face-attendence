from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.config import settings
from app.core.deps import (
    CurrentUser,
    DB_Dependency,
    get_current_user,
    professor_profile,
    require_student,
    student_profile,
)
from app.core.errors import AppError
from app.models import (
    AttendanceRecord,
    AttendanceSession,
    BiometricConsent,
    Class_,
    Course,
    Department,
    FaceEmbedding,
    Professor,
    Student,
    User,
)
from app.schemas.admin import AlertOut, AlertsOut
from app.schemas.profile import (
    ConsentAcceptIn,
    ConsentOut,
    FaceDataExportOut,
    FaceEmbeddingDataOut,
    ProfileOut,
    ProfileUpdateIn,
)
from app.services import face_service
from app.services.class_service import professor_class_filter
from app.utils.uuid import new_uuid, utcnow

router = APIRouter(tags=["profile"])


def _department_name(db: Session, department_id: str | None) -> str | None:
    if not department_id:
        return None
    department = db.get(Department, department_id)
    return department.name if department else None


def _profile_out(db: Session, user: User) -> ProfileOut:
    student = db.scalar(select(Student).where(Student.user_id == user.id))
    professor = db.scalar(select(Professor).where(Professor.user_id == user.id))
    profile = student or professor
    return ProfileOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        phone=user.phone,
        created_at=user.created_at,
        university_id=student.university_id if student else None,
        employee_id=professor.employee_id if professor else None,
        department_id=profile.department_id if profile else None,
        department_name=_department_name(db, profile.department_id if profile else None),
        program=student.program if student else None,
        year_level=student.year_level if student else None,
        title=professor.title if professor else None,
        office=professor.office if professor else None,
    )


def _current_consent(db: Session, student: Student) -> BiometricConsent | None:
    return db.scalar(select(BiometricConsent).where(BiometricConsent.student_id == student.id))


def _consent_out(student: Student, consent: BiometricConsent | None) -> ConsentOut:
    current_version = settings.biometric_consent_version
    return ConsentOut(
        id=consent.id if consent else None,
        student_id=student.id,
        consent_version=consent.consent_version if consent else None,
        current_version=current_version,
        consented_at=consent.consented_at if consent else None,
        revoked_at=consent.revoked_at if consent else None,
        is_active=bool(consent and consent.is_active),
        requires_new_consent=consent is None
        or not consent.is_active
        or consent.consent_version != current_version,
    )


def _low_attendance_alerts(db: Session, now: datetime, professor_id: str | None = None) -> list[AlertOut]:
    attended_case = case((AttendanceRecord.status.in_(["present", "late"]), 1), else_=0)
    query = (
        select(
            Student.id,
            User.full_name,
            User.email,
            func.count(AttendanceRecord.id).label("total"),
            func.sum(attended_case).label("attended"),
        )
        .join(User, User.id == Student.user_id)
        .join(AttendanceRecord, AttendanceRecord.student_id == Student.id)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .join(Class_, Class_.id == AttendanceSession.class_id)
        .group_by(Student.id, User.full_name, User.email)
        .having(func.count(AttendanceRecord.id) >= 3)
        .having(func.sum(attended_case) * 1.0 / func.count(AttendanceRecord.id) < 0.75)
        .order_by(func.count(AttendanceRecord.id).desc())
        .limit(5)
    )
    if professor_id:
        query = query.where(professor_class_filter(professor_id))
    items: list[AlertOut] = []
    for student_id, full_name, email, total, attended_count in db.execute(query).all():
        rate = round(int(attended_count or 0) / int(total) * 100)
        items.append(
            AlertOut(
                id=f"low-attendance-{student_id}",
                title=f"Low attendance: {full_name}",
                description=f"{rate}% attendance across {total} marked sessions.",
                severity="warning",
                href=f"/admin/users?search={email}",
                created_at=now,
            )
        )
    return items


def _session_alerts(db: Session, now: datetime, professor_id: str | None = None) -> list[AlertOut]:
    query = select(AttendanceSession).where(
        AttendanceSession.status == "active",
        or_(AttendanceSession.current_qr_hash.is_(None), AttendanceSession.ends_at < now),
    )
    if professor_id:
        query = query.where(
            AttendanceSession.class_id.in_(select(Class_.id).where(professor_class_filter(professor_id)))
        )
    sessions = db.scalars(query.order_by(AttendanceSession.starts_at.desc()).limit(5)).all()
    items: list[AlertOut] = []
    for session in sessions:
        overdue = session.ends_at < now
        items.append(
            AlertOut(
                id=f"session-{session.id}",
                title="Active session needs attention",
                description=(
                    f"Session ended at {session.ends_at:%H:%M} but is still active."
                    if overdue
                    else "Session is active but has no QR code."
                ),
                severity="danger" if overdue else "info",
                href="/professor/sessions",
                created_at=now,
            )
        )
    return items


def _student_alerts(db: Session, user: User, now: datetime) -> list[AlertOut]:
    student = student_profile(db, user)
    attended_case = case((AttendanceRecord.status.in_(["present", "late"]), 1), else_=0)
    rows = db.execute(
        select(
            Course.code,
            Course.name,
            func.count(AttendanceRecord.id),
            func.sum(attended_case),
        )
        .join(Class_, Class_.course_id == Course.id)
        .join(AttendanceSession, AttendanceSession.class_id == Class_.id)
        .join(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceRecord.student_id == student.id)
        .group_by(Course.id, Course.code, Course.name)
        .having(func.count(AttendanceRecord.id) >= 3)
        .having(func.sum(attended_case) * 1.0 / func.count(AttendanceRecord.id) < 0.75)
        .order_by(func.count(AttendanceRecord.id).desc())
        .limit(5)
    ).all()
    items: list[AlertOut] = []
    for code, name, total, attended_count in rows:
        rate = round(int(attended_count or 0) / int(total) * 100)
        items.append(
            AlertOut(
                id=f"low-attendance-{student.id}-{code}",
                title=f"Low attendance: {code}",
                description=f"{rate}% attendance in {name} across {total} marked sessions.",
                severity="warning",
                href="/student/history",
                created_at=now,
            )
        )
    consent = _consent_out(student, _current_consent(db, student))
    if consent.requires_new_consent:
        items.append(
            AlertOut(
                id=f"consent-{student.id}",
                title="Biometric consent required",
                description=f"Accept consent version {consent.current_version} to use face check-in.",
                severity="warning",
                href="/me/consent",
                created_at=now,
            )
        )
    return items


@router.get("/me/profile", response_model=ProfileOut)
def get_profile(db: DB_Dependency, user: CurrentUser) -> ProfileOut:
    return _profile_out(db, user)


@router.patch("/me/profile", response_model=ProfileOut)
def update_profile(
    payload: ProfileUpdateIn,
    request: Request,
    db: DB_Dependency,
    user: CurrentUser,
) -> ProfileOut:
    updates: dict[str, Any] = payload.model_dump(exclude_unset=True, exclude_none=True)
    before: dict[str, Any] = {}
    student_updates: dict[str, Any] = {}
    for key in ("full_name", "phone"):
        if key in updates:
            before[key] = getattr(user, key)
            setattr(user, key, updates[key])
    for key in ("program", "year_level"):
        if key in updates:
            student_updates[key] = updates.pop(key)
    if student_updates:
        student = student_profile(db, user)
        for key, value in student_updates.items():
            before[f"profile.{key}"] = getattr(student, key)
            setattr(student, key, value)
        updates.update(student_updates)
    if updates:
        user.updated_at = utcnow()
    write_audit_log(
        db,
        action="profile.update",
        entity_type="user",
        entity_id=user.id,
        actor=user,
        before=before,
        after=updates,
        request=request,
    )
    db.commit()
    return _profile_out(db, user)


@router.get("/me/consent", response_model=ConsentOut)
def get_consent(db: DB_Dependency, user: User = Depends(require_student)) -> ConsentOut:
    student = student_profile(db, user)
    return _consent_out(student, _current_consent(db, student))


@router.post("/me/consent", response_model=ConsentOut)
def accept_consent(
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_student),
    payload: ConsentAcceptIn | None = Body(default=None),
) -> ConsentOut:
    student = student_profile(db, user)
    version = payload.consent_version if payload and payload.consent_version else settings.biometric_consent_version
    if version != settings.biometric_consent_version:
        raise AppError(
            422,
            "validation_error",
            "Biometric consent version is outdated",
            {"expected_version": settings.biometric_consent_version},
        )
    existing = _current_consent(db, student)
    before = {
        "consent_version": existing.consent_version if existing else None,
        "is_active": bool(existing and existing.is_active),
    }
    consent = face_service.set_consent(db, student, version)
    write_audit_log(
        db,
        action="consent.accept",
        entity_type="student",
        entity_id=student.id,
        actor=user,
        before=before,
        after={"consent_version": version, "consented_at": consent.consented_at},
        request=request,
    )
    db.commit()
    return _consent_out(student, consent)


@router.get("/face/me/export", response_model=FaceDataExportOut)
def export_face_data(
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_student),
) -> FaceDataExportOut:
    student = student_profile(db, user)
    rows = db.scalars(
        select(FaceEmbedding)
        .where(FaceEmbedding.student_id == student.id)
        .order_by(FaceEmbedding.created_at.asc())
    ).all()
    vectors = [face_service._stored_embedding(row) for row in rows]
    embeddings = [
        FaceEmbeddingDataOut(
            id=row.id,
            vector=vector,
            model_name=row.model_name,
            vector_version=row.vector_version,
            is_active=row.is_active,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row, vector in zip(rows, vectors)
    ]
    consent = _consent_out(student, _current_consent(db, student))
    export_id = new_uuid()
    write_audit_log(
        db,
        action="face.export",
        entity_type="student",
        entity_id=student.id,
        actor=user,
        after={"export_id": export_id, "embedding_count": len(rows), "consent_version": consent.consent_version},
        request=request,
    )
    db.commit()
    return FaceDataExportOut(
        export_id=export_id,
        student_id=student.id,
        university_id=student.university_id,
        exported_at=utcnow(),
        embedding_count=len(rows),
        model_name=settings.face_model_name,
        vector_version=face_service.VECTOR_VERSION,
        descriptors=vectors,
        embeddings=embeddings,
        consent=consent,
        consent_metadata=consent,
    )


@router.get("/me/alerts", response_model=AlertsOut)
def alerts(db: DB_Dependency, user: User = Depends(get_current_user)) -> AlertsOut:
    now = utcnow()
    if user.role == "student":
        items = _student_alerts(db, user, now)
    elif user.role == "professor":
        professor = professor_profile(db, user)
        items = _low_attendance_alerts(db, now, professor.id) + _session_alerts(db, now, professor.id)
    elif user.role == "admin":
        items = _low_attendance_alerts(db, now) + _session_alerts(db, now)
    else:
        raise AppError(403, "forbidden", "Access denied")
    return AlertsOut(items=items[:8])
