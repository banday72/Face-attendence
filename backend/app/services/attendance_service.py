from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.config import settings
from app.core.errors import AppError
from app.core.security import hash_token
from app.models import (
    AttendanceRecord,
    AttendanceSession,
    BiometricConsent,
    Enrollment,
    Student,
    User,
)
from app.services import face_service, location_service, qr_service
from app.utils.uuid import new_uuid, utcnow


def ensure_enrolled(db: Session, student: Student, class_id: str) -> Enrollment:
    enrollment = db.scalar(
        select(Enrollment).where(
            Enrollment.student_id == student.id,
            Enrollment.class_id == class_id,
            Enrollment.status == "enrolled",
        )
    )
    if enrollment is None:
        raise AppError(403, "forbidden", "Student is not enrolled in this class")
    return enrollment


def ensure_session_open(session: AttendanceSession, now: datetime) -> None:
    if session.status != "active":
        raise AppError(409, "conflict", "Attendance session is not open", {"status": session.status})
    if now < session.starts_at or now > session.ends_at:
        raise AppError(403, "session_expired", "Attendance session is outside its scheduled time window")


def determine_status(now: datetime, session: AttendanceSession) -> str:
    late_after = session.starts_at + timedelta(minutes=session.late_minutes)
    return "late" if now > late_after else "present"


def _duplicate_record(db: Session, session_id: str, student_id: str) -> bool:
    return (
        db.scalar(
            select(func.count())
            .select_from(AttendanceRecord)
            .where(AttendanceRecord.session_id == session_id, AttendanceRecord.student_id == student_id)
        )
        or 0
    ) > 0


def _create_record(
    db: Session,
    *,
    session: AttendanceSession,
    student: Student,
    status: str,
    method: str,
    now: datetime,
    location_status: str,
    face_status: str,
    latitude: float | None = None,
    longitude: float | None = None,
    accuracy: float | None = None,
    face_score: float | None = None,
    challenge: str | None = None,
) -> AttendanceRecord:
    record = AttendanceRecord(
        id=new_uuid(),
        session_id=session.id,
        student_id=student.id,
        status=status,
        method=method,
        marked_at=now,
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        face_score=face_score,
        location_status=location_status,
        face_status=face_status,
        challenge=challenge,
        is_manual=False,
        created_at=now,
        updated_at=now,
    )
    try:
        with db.begin_nested():
            db.add(record)
            db.flush()
    except IntegrityError as exc:
        raise AppError(409, "duplicate_attendance", "Attendance has already been recorded for this session") from exc
    return record


def qr_check_in(
    db: Session,
    *,
    student: Student,
    token: str,
    latitude: float,
    longitude: float,
    accuracy: float,
    now: datetime | None = None,
) -> AttendanceRecord:
    now = now or utcnow()
    token_hash = hash_token(token)
    session = db.scalar(select(AttendanceSession).where(AttendanceSession.current_qr_hash == token_hash))
    if session is None:
        raise AppError(403, "conflict", "QR token is not valid", {"code_detail": "qr_token_invalid"})

    ensure_session_open(session, now)
    qr_service.validate_qr_token(db, session, token, now)
    if session.require_face:
        raise AppError(
            403,
            "face_verification_failed",
            "This session requires face verification; use the face check-in endpoint",
        )
    ensure_enrolled(db, student, session.class_id)
    if _duplicate_record(db, session.id, student.id):
        raise AppError(409, "duplicate_attendance", "Attendance has already been recorded for this session")

    location = location_service.verify_location(session, latitude, longitude, accuracy)
    qr_service.consume_qr_token(db, session, token_hash, student.id, now)
    return _create_record(
        db,
        session=session,
        student=student,
        status=determine_status(now, session),
        method="qr",
        now=now,
        location_status=location.status,
        face_status="not_required",
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
    )


def face_check_in(
    db: Session,
    *,
    student: Student,
    session_id: str,
    descriptors: list[list[float]],
    centers: list[list[float]],
    challenge: str,
    latitude: float | None = None,
    longitude: float | None = None,
    accuracy: float | None = None,
    now: datetime | None = None,
) -> AttendanceRecord:
    now = now or utcnow()
    session = db.get(AttendanceSession, session_id)
    if session is None:
        raise AppError(404, "not_found", "Session not found")

    ensure_session_open(session, now)
    ensure_enrolled(db, student, session.class_id)
    if _duplicate_record(db, session.id, student.id):
        raise AppError(409, "duplicate_attendance", "Attendance has already been recorded for this session")
    if not session.require_face or not session.challenge:
        raise AppError(403, "face_verification_failed", "This session does not require face verification")
    consent = db.scalar(select(BiometricConsent).where(BiometricConsent.student_id == student.id))
    if (
        consent is None
        or not consent.is_active
        or consent.revoked_at is not None
        or consent.consent_version != settings.biometric_consent_version
    ):
        raise AppError(
            403,
            "face_consent_required",
            "Active biometric consent is required before face check-in",
        )
    if challenge != session.challenge:
        raise AppError(
            403,
            "face_verification_failed",
            "Liveness challenge does not match the active challenge",
            {"code_detail": "invalid_challenge"},
        )

    location = location_service.verify_location(session, latitude, longitude, accuracy)
    analysis = face_service.analyze_client_frames(descriptors, centers)
    score = face_service.verify_student_face(db, student, analysis)
    return _create_record(
        db,
        session=session,
        student=student,
        status=determine_status(now, session),
        method="face",
        now=now,
        location_status=location.status,
        face_status="verified",
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        face_score=score,
        challenge=challenge,
    )


def mark_absent_for_session(
    db: Session,
    session: AttendanceSession,
    *,
    actor: User | None = None,
    request: Request | None = None,
    now: datetime | None = None,
) -> int:
    now = now or utcnow()
    recorded = set(
        db.scalars(select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == session.id)).all()
    )
    enrollments = db.scalars(
        select(Enrollment).where(Enrollment.class_id == session.class_id, Enrollment.status == "enrolled")
    ).all()
    absent_students: list[str] = []
    for enrollment in enrollments:
        if enrollment.student_id in recorded:
            continue
        if enrollment.created_at and enrollment.created_at > session.starts_at:
            continue
        _create_record(
            db,
            session=session,
            student=enrollment.student,
            status="absent",
            method="system",
            now=now,
            location_status="not_required",
            face_status="not_required",
        )
        absent_students.append(enrollment.student_id)

    if absent_students:
        write_audit_log(
            db,
            action="attendance.mark_absent",
            entity_type="attendance_session",
            entity_id=session.id,
            actor=actor,
            after={"session_id": session.id, "absent_student_ids": absent_students, "count": len(absent_students)},
            reason="Session closed",
            request=request,
        )
    return len(absent_students)


def _record_snapshot(record: AttendanceRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "session_id": record.session_id,
        "student_id": record.student_id,
        "status": record.status,
        "method": record.method,
        "marked_at": record.marked_at.isoformat() if record.marked_at else None,
        "location_status": record.location_status,
        "face_status": record.face_status,
        "is_manual": record.is_manual,
        "correction_reason": record.correction_reason,
    }


def manual_correction(
    db: Session,
    *,
    record: AttendanceRecord,
    status: str,
    method: str,
    reason: str,
    actor: User,
    request: Request | None = None,
    now: datetime | None = None,
) -> AttendanceRecord:
    now = now or utcnow()
    before = _record_snapshot(record)
    record.status = status
    record.method = method
    record.correction_reason = reason
    record.is_manual = True
    record.corrected_by_user_id = actor.id
    record.updated_at = now
    db.flush()
    write_audit_log(
        db,
        action="attendance.manual_correction",
        entity_type="attendance_record",
        entity_id=record.id,
        actor=actor,
        before=before,
        after=_record_snapshot(record),
        reason=reason,
        request=request,
    )
    return record
