from __future__ import annotations

from datetime import datetime
from typing import cast

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.deps import (
    assert_professor_owns_class,
    assert_professor_owns_session,
    assert_student_enrolled,
    professor_profile,
)
from app.core.errors import AppError
from app.models import (
    AttendanceCorrectionRequest,
    AttendanceRecord,
    AttendanceSession,
    Class_,
    Course,
    Student,
    User,
)
from app.schemas.attendance import AttendanceMethod, AttendanceStatus
from app.schemas.common import Page, PaginationParams, paginate
from app.schemas.corrections import (
    CorrectionRequestCreate,
    CorrectionRequestOut,
    CorrectionReviewIn,
    CorrectionStatus,
)
from app.services import attendance_service
from app.services.class_service import professor_class_filter
from app.utils.uuid import new_uuid, utcnow


def serialize_request(correction: AttendanceCorrectionRequest) -> CorrectionRequestOut:
    student = correction.student
    session = correction.session
    class_ = session.class_
    course = class_.course if class_ else None
    return CorrectionRequestOut(
        id=correction.id,
        session_id=correction.session_id,
        record_id=correction.record_id,
        requested_status=cast(AttendanceStatus, correction.requested_status),
        reason=correction.reason,
        review_note=correction.review_note,
        status=cast(CorrectionStatus, correction.status),
        reviewed_at=correction.reviewed_at,
        created_at=correction.created_at,
        student_name=student.user.full_name if student.user else "",
        university_id=student.university_id,
        course_code=course.code if course else "",
        class_section=class_.section if class_ else "",
        session_start=session.starts_at,
        reviewer_name=correction.reviewer.full_name if correction.reviewer else None,
    )


def _base_query():
    return (
        select(AttendanceCorrectionRequest)
        .join(Student, Student.id == AttendanceCorrectionRequest.student_id)
        .join(User, User.id == Student.user_id)
        .join(AttendanceSession, AttendanceSession.id == AttendanceCorrectionRequest.session_id)
        .join(Class_, Class_.id == AttendanceSession.class_id)
        .join(Course, Course.id == Class_.course_id)
    )


def _filtered_query(
    query,
    *,
    status: CorrectionStatus | None,
    from_date: datetime | None,
    to_date: datetime | None,
):
    if status is not None:
        query = query.where(AttendanceCorrectionRequest.status == status)
    if from_date is not None:
        query = query.where(AttendanceCorrectionRequest.created_at >= from_date)
    if to_date is not None:
        query = query.where(AttendanceCorrectionRequest.created_at <= to_date)
    return query.order_by(AttendanceCorrectionRequest.created_at.desc(), AttendanceCorrectionRequest.id.desc())


def create_request(
    db: Session,
    *,
    student: Student,
    actor: User,
    payload: CorrectionRequestCreate,
    request: Request | None = None,
) -> AttendanceCorrectionRequest:
    session = db.get(AttendanceSession, payload.session_id)
    if session is None:
        raise AppError(404, "not_found", "Attendance session not found")
    assert_student_enrolled(db, student, session.class_id)

    if payload.record_id is not None:
        record = db.get(AttendanceRecord, payload.record_id)
        if record is None or record.student_id != student.id or record.session_id != session.id:
            raise AppError(404, "not_found", "Attendance record not found for this student and session")

    duplicate = db.scalar(
        select(AttendanceCorrectionRequest.id).where(
            AttendanceCorrectionRequest.student_id == student.id,
            AttendanceCorrectionRequest.session_id == session.id,
            AttendanceCorrectionRequest.status == "pending",
        )
    )
    if duplicate is not None:
        raise AppError(409, "conflict", "A pending correction request already exists for this session")

    now = utcnow()
    correction = AttendanceCorrectionRequest(
        id=new_uuid(),
        student_id=student.id,
        session_id=session.id,
        record_id=payload.record_id,
        requested_status=payload.requested_status,
        reason=payload.reason,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    try:
        with db.begin_nested():
            db.add(correction)
            db.flush()
    except IntegrityError as exc:
        raise AppError(409, "conflict", "A pending correction request already exists for this session") from exc

    write_audit_log(
        db,
        action="attendance.correction_requested",
        entity_type="attendance_correction_request",
        entity_id=correction.id,
        actor=actor,
        after={
            "student_id": student.id,
            "session_id": session.id,
            "record_id": payload.record_id,
            "requested_status": payload.requested_status,
            "status": "pending",
        },
        reason=payload.reason,
        request=request,
    )
    return correction


def list_student_requests(
    db: Session,
    *,
    student: Student,
    status: CorrectionStatus | None,
    from_date: datetime | None,
    to_date: datetime | None,
    params: PaginationParams,
) -> Page[CorrectionRequestOut]:
    query = _filtered_query(
        _base_query().where(AttendanceCorrectionRequest.student_id == student.id),
        status=status,
        from_date=from_date,
        to_date=to_date,
    )
    result = paginate(db, query, params)
    return Page[CorrectionRequestOut](
        items=[serialize_request(item) for item in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


def list_review_requests(
    db: Session,
    *,
    actor: User,
    status: CorrectionStatus | None,
    from_date: datetime | None,
    to_date: datetime | None,
    class_id: str | None,
    params: PaginationParams,
) -> Page[CorrectionRequestOut]:
    query = _base_query()
    if class_id is not None:
        assert_professor_owns_class(db, actor, class_id)
        query = query.where(Class_.id == class_id)
    if actor.role == "professor":
        professor = professor_profile(db, actor)
        query = query.where(professor_class_filter(professor.id))
    query = _filtered_query(query, status=status, from_date=from_date, to_date=to_date)
    result = paginate(db, query, params)
    return Page[CorrectionRequestOut](
        items=[serialize_request(item) for item in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


def review_request(
    db: Session,
    *,
    correction_id: str,
    actor: User,
    payload: CorrectionReviewIn,
    request: Request | None = None,
) -> AttendanceCorrectionRequest:
    correction = db.get(AttendanceCorrectionRequest, correction_id)
    if correction is None:
        raise AppError(404, "not_found", "Correction request not found")
    assert_professor_owns_session(db, actor, correction.session_id)
    if correction.status != "pending":
        raise AppError(409, "conflict", "Only pending correction requests can be reviewed")

    if payload.decision == "approved":
        student = correction.student
        if actor.role == "admin" and student.user_id == actor.id:
            raise AppError(403, "forbidden", "Administrators cannot approve their own attendance")

        final_status = payload.final_status or cast(AttendanceStatus, correction.requested_status)
        reason_parts = [f"Correction request: {correction.reason}"]
        if payload.review_note:
            reason_parts.append(f"Review note: {payload.review_note}")
        correction_reason = " | ".join(reason_parts)[:500]

        record = correction.record
        if record is not None and (
            record.student_id != correction.student_id or record.session_id != correction.session_id
        ):
            raise AppError(404, "not_found", "Attendance record not found for this request")
        final_method = payload.final_method or cast(AttendanceMethod, record.method if record else "manual")
        if record is None:
            record = attendance_service._create_record(
                db,
                session=correction.session,
                student=student,
                status=final_status,
                method=final_method,
                now=utcnow(),
                location_status="not_required",
                face_status="not_required",
            )
        attendance_service.manual_correction(
            db,
            record=record,
            status=final_status,
            method=final_method,
            reason=correction_reason,
            actor=actor,
            request=request,
        )
        correction.record_id = record.id
        action = "attendance.correction_approved"
    else:
        action = "attendance.correction_rejected"

    before_status = correction.status
    correction.status = payload.decision
    correction.review_note = payload.review_note
    correction.reviewed_by_user_id = actor.id
    correction.reviewed_at = utcnow()
    correction.updated_at = correction.reviewed_at
    write_audit_log(
        db,
        action=action,
        entity_type="attendance_correction_request",
        entity_id=correction.id,
        actor=actor,
        before={"status": before_status},
        after={"status": correction.status, "review_note": correction.review_note},
        reason=payload.review_note,
        request=request,
    )
    db.flush()
    return correction


def withdraw_request(
    db: Session,
    *,
    correction_id: str,
    student: Student,
    actor: User,
    request: Request | None = None,
) -> AttendanceCorrectionRequest:
    correction = db.get(AttendanceCorrectionRequest, correction_id)
    if correction is None or correction.student_id != student.id:
        raise AppError(404, "not_found", "Correction request not found")
    if correction.status != "pending":
        raise AppError(409, "conflict", "Only pending correction requests can be withdrawn")

    write_audit_log(
        db,
        action="attendance.correction_withdrawn",
        entity_type="attendance_correction_request",
        entity_id=correction.id,
        actor=actor,
        before={"status": correction.status},
        after={"status": "withdrawn"},
        reason=correction.reason,
        request=request,
    )
    db.delete(correction)
    db.flush()
    return correction
