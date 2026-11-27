from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Request
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.deps import (
    CurrentUser,
    DB_Dependency,
    assert_professor_owns_class,
    assert_professor_owns_session,
    professor_profile,
    require_professor_or_admin,
)
from app.models import (
    AttendanceRecord,
    AttendanceSession,
    Class_,
    Course,
    Enrollment,
    Student,
    User,
)
from app.schemas.professor_tools import (
    ClassRiskOut,
    MarkAbsentResult,
    MissingStudentOut,
)
from app.services import attendance_service
from app.services.class_service import professor_class_filter

router = APIRouter(tags=["professor"])

ATTENDANCE_THRESHOLD = 0.75
MIN_ATTENDANCE_SAMPLE = 3


def _missing_students(db: Session, session: AttendanceSession) -> list[MissingStudentOut]:
    recorded = set(
        db.scalars(select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == session.id)).all()
    )
    rows = db.execute(
        select(Enrollment, Student, User.full_name)
        .join(Student, Student.id == Enrollment.student_id)
        .join(User, User.id == Student.user_id)
        .where(Enrollment.class_id == session.class_id, Enrollment.status == "enrolled")
        .order_by(Student.university_id.asc())
    ).all()
    items: list[MissingStudentOut] = []
    for enrollment, student, student_name in rows:
        if enrollment.student_id in recorded:
            continue
        if enrollment.created_at and enrollment.created_at > session.starts_at:
            continue
        items.append(
            MissingStudentOut(
                student_id=student.id,
                university_id=student.university_id,
                student_name=student_name,
                enrollment_status=enrollment.status,
            )
        )
    return items


@router.get("/sessions/{session_id}/attendance/missing", response_model=list[MissingStudentOut])
def missing_attendance(session_id: str, db: DB_Dependency, user: CurrentUser) -> list[MissingStudentOut]:
    actor = require_professor_or_admin(user)
    session = assert_professor_owns_session(db, actor, session_id)
    return _missing_students(db, session)


@router.post("/sessions/{session_id}/attendance/mark-absent", response_model=MarkAbsentResult)
def mark_remaining_absent(
    session_id: str, request: Request, db: DB_Dependency, user: CurrentUser
) -> MarkAbsentResult:
    actor = require_professor_or_admin(user)
    session = assert_professor_owns_session(db, actor, session_id)
    marked_student_ids = [item.student_id for item in _missing_students(db, session)]
    marked_count = attendance_service.mark_absent_for_session(db, session, actor=actor, request=request)
    write_audit_log(
        db,
        action="attendance.mark_remaining_absent",
        entity_type="attendance_session",
        entity_id=session.id,
        actor=actor,
        after={
            "session_id": session.id,
            "marked_count": marked_count,
            "marked_student_ids": marked_student_ids,
        },
        reason="Professor marked remaining students absent",
        request=request,
    )
    db.commit()
    return MarkAbsentResult(
        session_id=session.id,
        marked_count=marked_count,
        marked_student_ids=marked_student_ids,
    )


@router.get("/professor/classes/risk", response_model=list[ClassRiskOut])
def professor_classes_risk(db: DB_Dependency, user: CurrentUser) -> list[ClassRiskOut]:
    actor = require_professor_or_admin(user)
    classes_query = select(Class_, Course).join(Course, Course.id == Class_.course_id)
    if actor.role == "professor":
        classes_query = classes_query.where(professor_class_filter(professor_profile(db, actor).id))
    class_rows = db.execute(classes_query.order_by(Course.code.asc(), Class_.section.asc())).all()
    if not class_rows:
        return []

    class_ids = [class_.id for class_, _ in class_rows]
    for class_, _ in class_rows:
        assert_professor_owns_class(db, actor, class_.id)

    session_counts = {
        class_id: int(count or 0)
        for class_id, count in db.execute(
            select(AttendanceSession.class_id, func.count(AttendanceSession.id))
            .where(AttendanceSession.class_id.in_(class_ids))
            .group_by(AttendanceSession.class_id)
        ).all()
    }
    enrolled_counts = {
        class_id: int(count or 0)
        for class_id, count in db.execute(
            select(Enrollment.class_id, func.count(Enrollment.id))
            .where(Enrollment.class_id.in_(class_ids), Enrollment.status == "enrolled")
            .group_by(Enrollment.class_id)
        ).all()
    }

    attended_case = case((AttendanceRecord.status.in_(["present", "late"]), 1), else_=0)
    record_rows = db.execute(
        select(
            AttendanceSession.class_id,
            func.count(AttendanceRecord.id),
            func.sum(case((AttendanceRecord.status == "present", 1), else_=0)),
            func.sum(case((AttendanceRecord.status == "late", 1), else_=0)),
            func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)),
        )
        .join(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceSession.class_id.in_(class_ids))
        .group_by(AttendanceSession.class_id)
    ).all()
    record_stats = {
        class_id: (int(total or 0), int(present or 0), int(late or 0), int(absent or 0))
        for class_id, total, present, late, absent in record_rows
    }

    at_risk_rows = db.execute(
        select(AttendanceSession.class_id, func.count(AttendanceRecord.id))
        .join(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceSession.class_id.in_(class_ids))
        .group_by(AttendanceSession.class_id, AttendanceRecord.student_id)
        .having(func.count(AttendanceRecord.id) >= MIN_ATTENDANCE_SAMPLE)
        .having(
            func.sum(attended_case) * 1.0 / func.count(AttendanceRecord.id) < ATTENDANCE_THRESHOLD
        )
    ).all()
    at_risk_counts: Counter[str] = Counter()
    for class_id, _ in at_risk_rows:
        at_risk_counts[class_id] += 1

    items: list[ClassRiskOut] = []
    for class_, course in class_rows:
        total, present, late, absent = record_stats.get(class_.id, (0, 0, 0, 0))
        attended = present + late
        items.append(
            ClassRiskOut(
                class_id=class_.id,
                course_code=course.code,
                course_name=course.name,
                section=class_.section,
                enrolled_count=enrolled_counts.get(class_.id, 0),
                total_sessions=session_counts.get(class_.id, 0),
                present=present,
                late=late,
                absent=absent,
                attendance_rate=round(attended / total * 100, 2) if total else 0.0,
                at_risk_count=at_risk_counts.get(class_.id, 0),
            )
        )
    items.sort(key=lambda item: (item.attendance_rate, -item.absent))
    return items
