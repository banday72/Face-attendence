from __future__ import annotations

from datetime import datetime
from typing import Literal, cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AttendanceRecord, AttendanceSession, Enrollment
from app.schemas.attendance import (
    AttendanceMethod,
    AttendanceRecordOut,
    AttendanceStatus,
    FaceStatus,
    LocationStatus,
)
from app.schemas.common import PaginationParams
from app.schemas.reports import ReportRecordOut
from app.schemas.session import SessionOut, SessionStatus
from app.services import report_service


def pagination(
    page: int,
    page_size: int,
    sort_by: str | None = None,
    sort_order: str = "asc",
) -> PaginationParams:
    return PaginationParams(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=cast(Literal["asc", "desc"], sort_order),
    )


def serialize_record(record: AttendanceRecord) -> AttendanceRecordOut:
    student = record.student
    return AttendanceRecordOut(
        id=record.id,
        session_id=record.session_id,
        student_id=record.student_id,
        student_name=student.user.full_name if student.user else None,
        university_id=student.university_id,
        status=cast(AttendanceStatus, record.status),
        method=cast(AttendanceMethod, record.method),
        marked_at=record.marked_at,
        latitude=record.latitude,
        longitude=record.longitude,
        accuracy=record.accuracy,
        face_score=record.face_score,
        location_status=cast(LocationStatus, record.location_status),
        face_status=cast(FaceStatus, record.face_status),
        challenge=record.challenge,
        is_manual=record.is_manual,
        correction_reason=record.correction_reason,
    )


def session_counts(db: Session, session: AttendanceSession) -> dict[str, int]:
    total = int(
        db.scalar(
            select(func.count())
            .select_from(Enrollment)
            .where(Enrollment.class_id == session.class_id, Enrollment.status == "enrolled")
        )
        or 0
    )
    rows = db.execute(
        select(AttendanceRecord.status, func.count())
        .where(AttendanceRecord.session_id == session.id)
        .group_by(AttendanceRecord.status)
    ).all()
    counts = {str(status): int(count) for status, count in rows}
    return {
        "total_enrolled": total,
        "present_count": counts.get("present", 0),
        "late_count": counts.get("late", 0),
        "absent_count": counts.get("absent", 0),
    }


def serialize_session(db: Session, session: AttendanceSession) -> SessionOut:
    class_ = session.class_
    course = class_.course if class_ else None
    return SessionOut(
        id=session.id,
        class_id=session.class_id,
        classroom_id=session.classroom_id,
        course_code=course.code if course else None,
        course_name=course.name if course else None,
        section=class_.section if class_ else None,
        term=class_.term if class_ else None,
        professor_id=session.professor_id,
        starts_at=session.starts_at,
        ends_at=session.ends_at,
        status=cast(SessionStatus, session.status),
        require_face=session.require_face,
        require_location=session.require_location,
        late_minutes=session.late_minutes,
        qr_validity_seconds=session.qr_validity_seconds,
        qr_refresh_seconds=session.qr_refresh_seconds,
        challenge=session.challenge,
        qr_generation=session.qr_generation,
        created_at=session.created_at,
        **session_counts(db, session),
    )


def report_filters(
    department_id: str | None = None,
    course_id: str | None = None,
    class_id: str | None = None,
    student_id: str | None = None,
    professor_id: str | None = None,
    status: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    search: str | None = None,
    sort_by: str = "marked_at",
    sort_order: str = "desc",
    scope_professor_id: str | None = None,
) -> report_service.ReportFilters:
    return report_service.ReportFilters(
        department_id=department_id,
        course_id=course_id,
        class_id=class_id,
        student_id=student_id,
        professor_id=professor_id,
        status=status,
        from_date=from_date,
        to_date=to_date,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        scope_professor_id=scope_professor_id,
    )


def report_record_to_dict(record: ReportRecordOut) -> dict[str, object]:
    return record.model_dump(mode="json")
