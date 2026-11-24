from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select

from app.api.v1.endpoints._helpers import (
    pagination,
    serialize_record,
    serialize_session,
)
from app.core.audit import write_audit_log
from app.core.config import settings
from app.core.deps import (
    DB_Dependency,
    assert_professor_owns_class,
    assert_professor_owns_session,
    professor_profile,
    require_professor_or_admin,
    require_student,
    student_profile,
)
from app.core.errors import AppError
from app.models import (
    AttendanceRecord,
    AttendanceSession,
    Classroom,
    Enrollment,
    Student,
    User,
)
from app.schemas.attendance import RosterEntry
from app.schemas.common import Page, paginate
from app.schemas.session import (
    ActiveSessionOut,
    QRPayloadOut,
    SessionCreate,
    SessionOut,
    StartSessionOut,
)
from app.services import attendance_service, qr_service
from app.utils.uuid import new_uuid, utcnow

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> AttendanceSession:
    class_ = assert_professor_owns_class(db, user, payload.class_id)
    professor_id = class_.professor_id
    if user.role == "professor":
        professor_id = professor_profile(db, user).id
    if payload.classroom_id:
        classroom = db.get(Classroom, payload.classroom_id)
        if classroom is None or not classroom.is_active:
            raise AppError(404, "not_found", "Classroom not found or inactive")

    session = AttendanceSession(
        id=new_uuid(),
        class_id=payload.class_id,
        classroom_id=payload.classroom_id,
        professor_id=professor_id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        status="scheduled",
        require_face=payload.require_face,
        require_location=payload.require_location,
        late_minutes=payload.late_minutes
        if payload.late_minutes is not None
        else settings.default_late_minutes,
        qr_validity_seconds=payload.qr_validity_seconds
        if payload.qr_validity_seconds is not None
        else settings.default_qr_validity_seconds,
        qr_refresh_seconds=payload.qr_refresh_seconds
        if payload.qr_refresh_seconds is not None
        else settings.qr_refresh_seconds,
        challenge=payload.challenge,
        notes=payload.notes,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(session)
    db.flush()
    write_audit_log(
        db,
        action="session.create",
        entity_type="attendance_session",
        entity_id=session.id,
        actor=user,
        after={
            "class_id": session.class_id,
            "classroom_id": session.classroom_id,
            "starts_at": session.starts_at.isoformat(),
            "ends_at": session.ends_at.isoformat(),
            "require_face": session.require_face,
            "require_location": session.require_location,
        },
        request=request,
    )
    db.commit()
    db.refresh(session)
    return session


@router.get("", response_model=Page[SessionOut])
def list_sessions(
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    class_id: str | None = None,
    status_filter: str | None = Query(None, alias="status", pattern="^(scheduled|active|closed|cancelled)$"),
) -> Page[SessionOut]:
    params = pagination(page, page_size)
    query = select(AttendanceSession)
    if class_id:
        assert_professor_owns_class(db, user, class_id)
        query = query.where(AttendanceSession.class_id == class_id)
    elif user.role == "professor":
        professor = professor_profile(db, user)
        query = query.where(AttendanceSession.professor_id == professor.id)
    if status_filter:
        query = query.where(AttendanceSession.status == status_filter)
    query = query.order_by(AttendanceSession.starts_at.desc(), AttendanceSession.created_at.desc())
    result = paginate(db, query, params)
    return Page[SessionOut](
        items=[serialize_session(db, session) for session in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/active", response_model=Page[ActiveSessionOut])
def active_sessions(
    db: DB_Dependency,
    user: User = Depends(require_student),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[ActiveSessionOut]:
    params = pagination(page, page_size)
    student = student_profile(db, user)
    now = utcnow()
    query = (
        select(AttendanceSession)
        .join(Enrollment, Enrollment.class_id == AttendanceSession.class_id)
        .where(
            Enrollment.student_id == student.id,
            Enrollment.status == "enrolled",
            AttendanceSession.status == "active",
            AttendanceSession.starts_at <= now,
            AttendanceSession.ends_at >= now,
        )
        .order_by(AttendanceSession.starts_at.desc())
    )
    result = paginate(db, query, params)
    items: list[ActiveSessionOut] = []
    for session in result.items:
        class_ = session.class_
        course = class_.course if class_ else None
        classroom = session.classroom
        items.append(
            ActiveSessionOut(
                id=session.id,
                class_id=session.class_id,
                course_code=course.code if course else None,
                course_name=course.name if course else None,
                section=class_.section if class_ else None,
                starts_at=session.starts_at,
                ends_at=session.ends_at,
                require_face=session.require_face,
                require_location=session.require_location,
                challenge=session.challenge,
                classroom_id=session.classroom_id,
                classroom_name=classroom.name if classroom else None,
                latitude=classroom.latitude if classroom else None,
                longitude=classroom.longitude if classroom else None,
            )
        )
    return Page[ActiveSessionOut](
        items=items,
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: str, db: DB_Dependency, user: User = Depends(require_professor_or_admin)
) -> SessionOut:
    session = assert_professor_owns_session(db, user, session_id)
    return serialize_session(db, session)


@router.post("/{session_id}/start", response_model=StartSessionOut)
def start_session(
    session_id: str,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> StartSessionOut:
    session = assert_professor_owns_session(db, user, session_id)
    if session.status != "scheduled":
        raise AppError(409, "conflict", "Only scheduled sessions can be started", {"status": session.status})
    session.status = "active"
    session.updated_at = utcnow()
    issued = qr_service.issue_qr(db, session)
    write_audit_log(
        db,
        action="session.start",
        entity_type="attendance_session",
        entity_id=session.id,
        actor=user,
        after={"status": "active", "qr_generation": issued.generation},
        request=request,
    )
    db.commit()
    return StartSessionOut(
        session=serialize_session(db, session),
        qr=QRPayloadOut(
            qr_payload=issued.payload,
            expires_at=issued.expires_at,
            generation=issued.generation,
            refresh_after_seconds=issued.refresh_after_seconds,
        ),
    )


@router.post("/{session_id}/qr/refresh", response_model=QRPayloadOut)
def refresh_qr(
    session_id: str,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> QRPayloadOut:
    session = assert_professor_owns_session(db, user, session_id)
    if session.status != "active":
        raise AppError(409, "conflict", "QR tokens can only be refreshed for active sessions")
    issued = qr_service.issue_qr(db, session)
    session.updated_at = utcnow()
    write_audit_log(
        db,
        action="session.qr_refresh",
        entity_type="attendance_session",
        entity_id=session.id,
        actor=user,
        after={"qr_generation": issued.generation},
        request=request,
    )
    db.commit()
    return QRPayloadOut(
        qr_payload=issued.payload,
        expires_at=issued.expires_at,
        generation=issued.generation,
        refresh_after_seconds=issued.refresh_after_seconds,
    )


@router.post("/{session_id}/close", response_model=SessionOut)
def close_session(
    session_id: str,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> SessionOut:
    session = assert_professor_owns_session(db, user, session_id)
    if session.status != "active":
        raise AppError(409, "conflict", "Only active sessions can be closed", {"status": session.status})
    session.status = "closed"
    session.updated_at = utcnow()
    qr_service.clear_qr(db, session)
    attendance_service.mark_absent_for_session(db, session, actor=user, request=request)
    write_audit_log(
        db,
        action="session.close",
        entity_type="attendance_session",
        entity_id=session.id,
        actor=user,
        after={"status": "closed"},
        request=request,
    )
    db.commit()
    return serialize_session(db, session)


@router.get("/{session_id}/attendance", response_model=Page[RosterEntry])
def session_attendance(
    session_id: str,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[RosterEntry]:
    params = pagination(page, page_size)
    session = assert_professor_owns_session(db, user, session_id)
    query = (
        select(Enrollment)
        .join(Student, Student.id == Enrollment.student_id)
        .where(Enrollment.class_id == session.class_id, Enrollment.status == "enrolled")
        .order_by(Student.university_id.asc())
    )
    result = paginate(db, query, params)
    records = {
        record.student_id: record
        for record in db.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)).all()
    }
    items: list[RosterEntry] = []
    for enrollment in result.items:
        student = enrollment.student
        record = records.get(student.id)
        items.append(
            RosterEntry(
                student_id=student.id,
                university_id=student.university_id,
                student_name=student.user.full_name,
                enrollment_status=enrollment.status,
                record=serialize_record(record) if record else None,
            )
        )
    return Page[RosterEntry](
        items=items,
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )
