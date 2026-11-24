from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.api.v1.endpoints._helpers import pagination, report_filters, serialize_record
from app.core.deps import (
    DB_Dependency,
    assert_professor_owns_class,
    assert_professor_owns_session,
    get_current_user,
    professor_profile,
    require_professor,
    require_professor_or_admin,
    require_student,
    student_profile,
)
from app.core.errors import AppError
from app.core.rate_limit import face_attendance_limit, qr_checkin_limit
from app.models import (
    AttendanceRecord,
    AttendanceSession,
    Class_,
    Course,
    Enrollment,
    User,
)
from app.schemas.attendance import (
    AttendanceRecordOut,
    ClassAttendanceOut,
    CoursePercentage,
    FaceCheckInIn,
    ManualCorrectionIn,
    ProfessorDashboardOut,
    QRCheckInIn,
    RosterEntry,
    StudentAttendanceHistory,
    StudentDashboardOut,
)
from app.schemas.common import Page, apply_sort, paginate
from app.schemas.reports import ReportRecordOut
from app.services import attendance_service, report_service

router = APIRouter(prefix="", tags=["attendance"])


def _course_percentages(db: Session, student_id: str) -> list[CoursePercentage]:
    attended = case((AttendanceRecord.status.in_(["present", "late"]), 1), else_=0)
    rows = db.execute(
        select(Course.id, Course.code, Course.name, func.count(), func.sum(attended))
        .join(Class_, Class_.course_id == Course.id)
        .join(AttendanceSession, AttendanceSession.class_id == Class_.id)
        .join(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceRecord.student_id == student_id)
        .group_by(Course.id, Course.code, Course.name)
        .order_by(Course.code.asc())
    ).all()
    return [
        CoursePercentage(
            course_id=str(course_id),
            course_code=code,
            course_name=name,
            total_sessions=int(total),
            attended=int(attended_count or 0),
            percentage=round((int(attended_count or 0) / int(total)) * 100, 2) if total else 0.0,
        )
        for course_id, code, name, total, attended_count in rows
    ]


@router.post(
    "/attendance/qr", response_model=AttendanceRecordOut, status_code=status.HTTP_201_CREATED
)
@qr_checkin_limit
def qr_check_in(
    payload: QRCheckInIn,
    request: Request,
    response: Response,
    db: DB_Dependency,
    user: User = Depends(require_student),
) -> AttendanceRecordOut:
    student = student_profile(db, user)
    record = attendance_service.qr_check_in(
        db,
        student=student,
        token=payload.token,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy=payload.accuracy,
    )
    db.commit()
    return serialize_record(record)


@router.post(
    "/attendance/face", response_model=AttendanceRecordOut, status_code=status.HTTP_201_CREATED
)
@face_attendance_limit
def face_check_in(
    payload: FaceCheckInIn,
    request: Request,
    response: Response,
    db: DB_Dependency,
    user: User = Depends(require_student),
) -> AttendanceRecordOut:
    student = student_profile(db, user)
    record = attendance_service.face_check_in(
        db,
        student=student,
        session_id=payload.session_id,
        frames=payload.frames,
        challenge=payload.challenge,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy=payload.accuracy,
    )
    db.commit()
    return serialize_record(record)


@router.get("/attendance/me", response_model=StudentAttendanceHistory)
def my_attendance(
    db: DB_Dependency,
    user: User = Depends(require_student),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    course_id: str | None = None,
    status: str | None = Query(None, pattern="^(present|late|absent|excused)$"),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    sort_by: str = "marked_at",
    sort_order: str = "desc",
) -> StudentAttendanceHistory:
    params = pagination(page, page_size, sort_by, sort_order)
    student = student_profile(db, user)
    query = (
        select(AttendanceRecord)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .join(Class_, Class_.id == AttendanceSession.class_id)
        .where(AttendanceRecord.student_id == student.id)
    )
    if course_id:
        query = query.where(Class_.course_id == course_id)
    if status:
        query = query.where(AttendanceRecord.status == status)
    if from_date:
        query = query.where(AttendanceRecord.marked_at >= from_date)
    if to_date:
        query = query.where(AttendanceRecord.marked_at <= to_date)
    sort_column = {
        "marked_at": AttendanceRecord.marked_at,
        "status": AttendanceRecord.status,
        "method": AttendanceRecord.method,
    }.get(sort_by, AttendanceRecord.marked_at)
    query = apply_sort(query, sort_column, params)
    result = paginate(db, query, params)
    return StudentAttendanceHistory(
        items=[serialize_record(record) for record in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
        course_percentages=_course_percentages(db, student.id),
    )


@router.get("/attendance/classes/{class_id}", response_model=ClassAttendanceOut)
def class_attendance(
    class_id: str,
    db: DB_Dependency,
    user: User = Depends(get_current_user),
) -> ClassAttendanceOut:
    from app.core.deps import assert_student_enrolled

    if user.role not in {"student", "professor", "admin"}:
        raise AppError(403, "forbidden", "Access denied")
    class_ = None
    if user.role == "student":
        student = student_profile(db, user)
        assert_student_enrolled(db, student, class_id)
    else:
        class_ = assert_professor_owns_class(db, user, class_id)
    if class_ is None:
        class_ = db.get(Class_, class_id)
    if class_ is None:
        raise AppError(404, "not_found", "Class not found")

    enrollments = db.scalars(
        select(Enrollment).where(Enrollment.class_id == class_id, Enrollment.status == "enrolled")
    ).all()
    session_ids = select(AttendanceSession.id).where(AttendanceSession.class_id == class_id)
    records = db.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id.in_(session_ids))).all()
    records_by_student: dict[str, AttendanceRecord] = {}
    for latest_record in records:
        existing = records_by_student.get(latest_record.student_id)
        if existing is None or latest_record.marked_at > existing.marked_at:
            records_by_student[latest_record.student_id] = latest_record

    roster: list[RosterEntry] = []
    for enrollment in enrollments:
        student = enrollment.student
        record = records_by_student.get(student.id)
        roster.append(
            RosterEntry(
                student_id=student.id,
                university_id=student.university_id,
                student_name=student.user.full_name,
                enrollment_status=enrollment.status,
                record=serialize_record(record) if record else None,
            )
        )

    statuses = [record.status for record in records_by_student.values()]
    present = statuses.count("present")
    late = statuses.count("late")
    absent = statuses.count("absent")
    attended = present + late
    return ClassAttendanceOut(
        class_id=class_.id,
        course_code=class_.course.code,
        course_name=class_.course.name,
        section=class_.section,
        total_students=len(roster),
        present=present,
        late=late,
        absent=absent,
        attendance_percentage=round(attended / len(roster) * 100, 2) if roster else 0.0,
        roster=roster,
    )


@router.patch("/attendance/{record_id}", response_model=AttendanceRecordOut)
def correct_attendance(
    record_id: str,
    payload: ManualCorrectionIn,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_professor_or_admin),
) -> AttendanceRecordOut:
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise AppError(404, "not_found", "Attendance record not found")
    assert_professor_owns_session(db, actor, record.session_id)
    student = record.student
    if actor.role == "admin" and student.user_id == actor.id:
        raise AppError(403, "forbidden", "Administrators cannot grant attendance to themselves")
    updated = attendance_service.manual_correction(
        db,
        record=record,
        status=payload.status,
        method=payload.method,
        reason=payload.reason,
        actor=actor,
        request=request,
    )
    db.commit()
    return serialize_record(updated)


@router.get("/professor/dashboard", response_model=ProfessorDashboardOut)
def professor_dashboard(db: DB_Dependency, user: User = Depends(require_professor)) -> ProfessorDashboardOut:
    professor = professor_profile(db, user)
    class_ids = select(Class_.id).where(Class_.professor_id == professor.id)
    session_ids = select(AttendanceSession.id).where(AttendanceSession.class_id.in_(class_ids))
    counts = {
        "classes": int(db.scalar(select(func.count()).select_from(Class_).where(Class_.professor_id == professor.id)) or 0),
        "sessions": int(db.scalar(select(func.count()).select_from(AttendanceSession).where(AttendanceSession.class_id.in_(class_ids))) or 0),
        "active_sessions": int(
            db.scalar(
                select(func.count()).select_from(AttendanceSession).where(AttendanceSession.status == "active", AttendanceSession.class_id.in_(class_ids))
            )
            or 0
        ),
        "attendance_records": int(
            db.scalar(select(func.count()).select_from(AttendanceRecord).where(AttendanceRecord.session_id.in_(session_ids))) or 0
        ),
    }
    attended = int(
        db.scalar(
            select(func.count())
            .select_from(AttendanceRecord)
            .where(AttendanceRecord.session_id.in_(session_ids), AttendanceRecord.status.in_(["present", "late"]))
        )
        or 0
    )
    recent = db.scalars(
        select(AttendanceSession)
        .where(AttendanceSession.class_id.in_(class_ids))
        .order_by(AttendanceSession.created_at.desc())
        .limit(5)
    ).all()
    return ProfessorDashboardOut(
        counts=counts,
        attendance={
            "total": counts["attendance_records"],
            "attended": attended,
            "attendance_rate": round(attended / counts["attendance_records"], 4) if counts["attendance_records"] else 0.0,
        },
        recent_sessions=[
            {
                "id": session.id,
                "class_id": session.class_id,
                "status": session.status,
                "starts_at": session.starts_at.isoformat(),
            }
            for session in recent
        ],
    )


@router.get("/professor/attendance/history", response_model=Page[ReportRecordOut])
def professor_attendance_history(
    db: DB_Dependency,
    user: User = Depends(require_professor),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    class_id: str | None = None,
    course_id: str | None = None,
    student_id: str | None = None,
    status: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    search: str | None = Query(None, max_length=100),
    sort_by: str = "marked_at",
    sort_order: str = "desc",
) -> Page[ReportRecordOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    professor = professor_profile(db, user)
    filters = report_filters(
        class_id=class_id,
        course_id=course_id,
        student_id=student_id,
        status=status,
        from_date=from_date,
        to_date=to_date,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        scope_professor_id=professor.id,
    )
    result = paginate(db, report_service.records_query(db, filters), params)
    items = [report_service.record_to_report(record) for record in result.items]
    return Page[ReportRecordOut](
        items=items,
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/student/dashboard", response_model=StudentDashboardOut)
def student_dashboard(db: DB_Dependency, user: User = Depends(require_student)) -> StudentDashboardOut:
    student = student_profile(db, user)
    percentages = _course_percentages(db, student.id)
    warnings = [
        f"Attendance in {item.course_code} is below 75% ({item.percentage}%)"
        for item in percentages
        if item.percentage < 75
    ]
    recent = db.scalars(
        select(AttendanceRecord)
        .where(AttendanceRecord.student_id == student.id)
        .order_by(AttendanceRecord.marked_at.desc())
        .limit(5)
    ).all()
    totals = {
        "classes": int(
            db.scalar(
                select(func.count())
                .select_from(Enrollment)
                .where(Enrollment.student_id == student.id, Enrollment.status == "enrolled")
            )
            or 0
        ),
        "records": int(
            db.scalar(select(func.count()).select_from(AttendanceRecord).where(AttendanceRecord.student_id == student.id))
            or 0
        ),
        "average_percentage": round(sum(item.percentage for item in percentages) / len(percentages), 2)
        if percentages
        else 0.0,
    }
    return StudentDashboardOut(
        percentages=percentages,
        warnings=warnings,
        recent_activity=[serialize_record(record) for record in recent],
        totals=totals,
    )
