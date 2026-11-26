from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.deps import DB_Dependency, require_admin
from app.core.errors import AppError
from app.models import (
    AcademicHoliday,
    Class_,
    Classroom,
    Course,
    Department,
    Professor,
    Schedule,
    Semester,
    User,
    class_professors,
    course_professors,
    course_semesters,
)
from app.schemas.admin import (
    ClassOut,
    FacultyOut,
    SemesterOut,
)
from app.schemas.common import Page
from app.schemas.timetable import (
    ClassroomCreate,
    ClassroomOut,
    ClassroomUpdate,
    ClassType,
    ConflictCheckOut,
    ConflictOut,
    DepartmentDetailOut,
    FacultyUpdate,
    HolidayCreate,
    HolidayOut,
    HolidayUpdate,
    ProfessorAssignmentIn,
    ScheduleGroupOut,
    SemesterAssignmentIn,
    SubjectCreate,
    SubjectOut,
    SubjectUpdate,
    TimetableEntryOut,
    TimetableScheduleCreate,
    TimetableScheduleUpdate,
    TimetableSummaryOut,
)
from app.services import class_service, timetable_service
from app.utils.uuid import new_uuid, utcnow

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _get_or_404(db: Session, model: Any, entity_id: str, label: str) -> Any:
    entity = db.get(model, entity_id)
    if entity is None:
        raise AppError(404, "not_found", f"{label} not found")
    return entity


def _check_unique(db: Session, model: Any, column: Any, value: Any, label: str, exclude_id: str | None = None) -> None:
    query = select(model).where(column == value)
    if exclude_id:
        query = query.where(model.id != exclude_id)
    if db.scalar(query) is not None:
        raise AppError(409, "conflict", f"{label} already exists")


def _apply(entity: Any, payload: Any, skip: set[str] | None = None) -> dict[str, Any]:
    before: dict[str, Any] = {}
    for key, value in payload.model_dump(exclude_unset=True).items():
        if skip and key in skip:
            continue
        before[key] = getattr(entity, key, None)
        setattr(entity, key, value)
    return before


def _resolve_class(db: Session, payload: TimetableScheduleCreate) -> Class_:
    if payload.class_id:
        return _get_or_404(db, Class_, payload.class_id, "Class")
    if not payload.course_id:
        raise AppError(422, "validation_error", "Choose a class or a subject")
    query = select(Class_).where(Class_.course_id == payload.course_id, Class_.is_active.is_(True))
    if payload.semester_id:
        query = query.where(Class_.semester_id == payload.semester_id)
    if payload.department_id:
        query = query.where(Class_.department_id == payload.department_id)
    if payload.professor_id:
        query = query.where(Class_.professor_id == payload.professor_id)
    existing = db.scalars(query.order_by(Class_.created_at.asc()).limit(1)).first()
    if existing:
        return existing

    course = _get_or_404(db, Course, payload.course_id, "Subject")
    semester = _get_or_404(db, Semester, payload.semester_id, "Semester") if payload.semester_id else None
    section = payload.section or "A"
    term = semester.name if semester else semester.academic_year if semester else "General"
    class_ = Class_(
        id=new_uuid(),
        course_id=payload.course_id,
        professor_id=payload.professor_id,
        department_id=payload.department_id or course.department_id,
        semester_id=payload.semester_id,
        section=section,
        term=term,
        name=None,
        capacity=60,
        is_active=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(class_)
    db.flush()
    if payload.professor_id:
        db.execute(
            class_professors.insert().values(
                class_id=class_.id, professor_id=payload.professor_id, created_at=utcnow()
            )
        )
    return class_


def _build_rules(
    db: Session, payload: TimetableScheduleCreate, class_: Class_
) -> list[Schedule]:
    group_id = new_uuid()
    kind = payload.recurrence_type
    semester = db.get(Semester, payload.semester_id) if payload.semester_id else None
    days = list(payload.days_of_week)
    within_semester = bool(
        semester
        and semester.start_date
        and semester.end_date
        and payload.start_date
        and semester.start_date <= payload.start_date <= semester.end_date
    )
    auto_end = semester.end_date if semester and within_semester else None
    if kind not in {"weekly", "semester"}:
        anchor = payload.custom_dates[0] if kind == "custom" and payload.custom_dates else payload.start_date
        days = [anchor.weekday() if anchor else 0]
    rules: list[Schedule] = []
    for day in sorted(set(days)):
        rules.append(
            Schedule(
                id=new_uuid(),
                schedule_group_id=group_id,
                class_id=class_.id,
                classroom_id=payload.classroom_id,
                day_of_week=day,
                start_time=payload.start_time,
                end_time=payload.end_time,
                department_id=payload.department_id or class_.department_id,
                semester_id=payload.semester_id or class_.semester_id,
                course_id=payload.course_id or class_.course_id,
                professor_id=payload.professor_id or class_.professor_id,
                class_type=payload.class_type,
                notes=payload.notes,
                recurrence_type=kind,
                start_date=payload.start_date,
                end_date=payload.end_date or auto_end,
                repeat_days=[day] if kind in {"weekly", "semester"} else [],
                custom_dates=[item.isoformat() for item in payload.custom_dates],
                holiday_dates=[item.isoformat() for item in payload.holiday_dates],
                monthly_mode=payload.monthly_mode,
                exclude_holidays=payload.exclude_holidays,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    return rules


def _validate_rules(db: Session, rules: list[Schedule]) -> list[ConflictOut]:
    conflicts: list[ConflictOut] = []
    for rule in rules:
        conflicts.extend(timetable_service.conflicts_for_schedule(db, rule))
    return conflicts


def _raise_conflicts(conflicts: list[ConflictOut]) -> None:
    errors = [item for item in conflicts if item.severity == "error"]
    if errors:
        raise AppError(
            409,
            "scheduling_conflict",
            errors[0].message,
            {"conflicts": [item.model_dump(mode="json") for item in errors]},
        )


def _group_out(db: Session, group_id: str) -> ScheduleGroupOut:
    schedules = db.scalars(
        select(Schedule).where(Schedule.schedule_group_id == group_id).order_by(Schedule.day_of_week, Schedule.start_time)
    ).all()
    occurrences = sum(
        len(timetable_service.occurrence_dates(schedule)) for schedule in schedules
    )
    return ScheduleGroupOut(
        group_id=group_id,
        items=[class_service.schedule_to_out(db, schedule) for schedule in schedules],
        occurrences=occurrences,
    )


def _window_for(
    view: str,
    day: date | None,
    from_date: date | None,
    to_date: date | None,
) -> tuple[date, date]:
    today = day or from_date or date.today()
    if view == "day":
        return today, today
    if view == "week":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    if view == "month":
        return today.replace(day=1), today.replace(day=calendar.monthrange(today.year, today.month)[1])
    return from_date or today, to_date or (from_date or today) + timedelta(days=30)


def _filtered_schedules(
    db: Session,
    *,
    department_id: str | None,
    semester_id: str | None,
    professor_id: str | None,
    classroom_id: str | None,
    course_id: str | None,
    class_id: str | None,
    class_type: ClassType | None,
) -> list[Schedule]:
    query = select(Schedule)
    if classroom_id:
        query = query.where(Schedule.classroom_id == classroom_id)
    if class_id:
        query = query.where(Schedule.class_id == class_id)
    if class_type:
        query = query.where(Schedule.class_type == class_type)
    schedules = db.scalars(query).all()
    ctx = timetable_service.Context(db)

    def matches_course(schedule: Schedule) -> bool:
        if not course_id:
            return True
        linked_class = ctx.class_(schedule.class_id)
        return (schedule.course_id or (linked_class.course_id if linked_class else None)) == course_id

    return [
        schedule
        for schedule in schedules
        if (
            (not department_id or timetable_service.effective_department_id(schedule, ctx) == department_id)
            and (not semester_id or timetable_service.effective_semester_id(schedule, ctx) == semester_id)
            and (not professor_id or timetable_service.effective_professor_id(schedule, ctx) == professor_id)
            and matches_course(schedule)
        )
    ]


@router.get("/timetable", response_model=Page[TimetableEntryOut])
def list_timetable(
    db: DB_Dependency,
    view: str = Query("list", pattern="^(day|week|month|list)$"),
    day: date | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    department_id: str | None = None,
    semester_id: str | None = None,
    professor_id: str | None = None,
    classroom_id: str | None = None,
    course_id: str | None = None,
    class_id: str | None = None,
    class_type: ClassType | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
) -> Page[TimetableEntryOut]:
    start, end = _window_for(view, day, from_date, to_date)
    schedules = _filtered_schedules(
        db,
        department_id=department_id,
        semester_id=semester_id,
        professor_id=professor_id,
        classroom_id=classroom_id,
        course_id=course_id,
        class_id=class_id,
        class_type=class_type,
    )
    entries = timetable_service.build_entries(db, schedules, start, end)
    total = len(entries)
    offset = (page - 1) * page_size
    return Page[TimetableEntryOut](
        items=entries[offset : offset + page_size],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/timetable/summary", response_model=TimetableSummaryOut)
def timetable_summary(db: DB_Dependency) -> TimetableSummaryOut:
    today = date.today()
    schedules = db.scalars(select(Schedule)).all()
    entries = timetable_service.build_entries(db, schedules, today - timedelta(days=1), today + timedelta(days=7))
    by_type: dict[str, int] = {}
    for schedule in schedules:
        by_type[schedule.class_type] = by_type.get(schedule.class_type, 0) + 1
    conflicts = timetable_service.list_conflicts(db, today, today + timedelta(days=30))
    return TimetableSummaryOut(
        total_schedules=len(schedules),
        classes_today=sum(1 for item in entries if item.date == today),
        upcoming_classes=sum(1 for item in entries if today < item.date <= today + timedelta(days=7)),
        conflicts=len(conflicts),
        by_type=by_type,
    )


@router.get("/timetable/conflicts", response_model=list[ConflictOut])
def list_timetable_conflicts(
    db: DB_Dependency,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[ConflictOut]:
    start = from_date or date.today()
    end = to_date or start + timedelta(days=30)
    return timetable_service.list_conflicts(db, start, end)


@router.post("/schedules/check-conflicts", response_model=ConflictCheckOut)
def check_schedule_conflicts(payload: TimetableScheduleCreate, db: DB_Dependency) -> ConflictCheckOut:
    class_ = _resolve_class(db, payload)
    rules = _build_rules(db, payload, class_)
    conflicts = _validate_rules(db, rules)
    occurrences = sum(len(timetable_service.occurrence_dates(rule)) for rule in rules)
    return ConflictCheckOut(
        valid=not any(item.severity == "error" for item in conflicts),
        conflicts=conflicts,
        occurrence_count=occurrences,
    )


@router.post(
    "/timetable/schedules", response_model=ScheduleGroupOut, status_code=status.HTTP_201_CREATED
)
def create_timetable_schedule(
    payload: TimetableScheduleCreate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> ScheduleGroupOut:
    class_ = _resolve_class(db, payload)
    rules = _build_rules(db, payload, class_)
    conflicts = _validate_rules(db, rules)
    _raise_conflicts(conflicts)
    db.add_all(rules)
    db.flush()
    write_audit_log(
        db,
        action="schedule_group.create",
        entity_type="schedule",
        entity_id=rules[0].schedule_group_id,
        actor=actor,
        after={"class_id": class_.id, "recurrence_type": payload.recurrence_type, "rules": len(rules)},
        request=request,
    )
    db.commit()
    return _group_out(db, str(rules[0].schedule_group_id))


@router.get("/timetable/schedules/{group_id}", response_model=ScheduleGroupOut)
def get_timetable_schedule(group_id: str, db: DB_Dependency) -> ScheduleGroupOut:
    schedules = db.scalars(
        select(Schedule).where(Schedule.schedule_group_id == group_id)
    ).all()
    if not schedules:
        raise AppError(404, "not_found", "Schedule group not found")
    return _group_out(db, group_id)


@router.patch("/timetable/schedules/{group_id}", response_model=ScheduleGroupOut)
def update_timetable_schedule(
    group_id: str,
    payload: TimetableScheduleUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> ScheduleGroupOut:
    current = db.scalars(
        select(Schedule).where(Schedule.schedule_group_id == group_id).order_by(Schedule.day_of_week)
    ).all()
    if not current:
        raise AppError(404, "not_found", "Schedule group not found")
    base = current[0]
    merged = TimetableScheduleCreate(
        class_id=base.class_id,
        department_id=payload.department_id if payload.department_id is not None else base.department_id,
        semester_id=payload.semester_id if payload.semester_id is not None else base.semester_id,
        course_id=payload.course_id if payload.course_id is not None else base.course_id,
        professor_id=payload.professor_id if payload.professor_id is not None else base.professor_id,
        classroom_id=payload.classroom_id if payload.classroom_id is not None else base.classroom_id,
        days_of_week=payload.days_of_week
        if payload.days_of_week is not None
        else [item.day_of_week for item in current],
        start_time=payload.start_time or base.start_time,
        end_time=payload.end_time or base.end_time,
        class_type=payload.class_type or base.class_type,  # type: ignore[arg-type]
        notes=payload.notes if payload.notes is not None else base.notes,
        recurrence_type=payload.recurrence_type or base.recurrence_type,  # type: ignore[arg-type]
        start_date=payload.start_date if payload.start_date is not None else base.start_date,
        end_date=payload.end_date if payload.end_date is not None else base.end_date,
        custom_dates=payload.custom_dates
        if payload.custom_dates is not None
        else [date.fromisoformat(item) for item in timetable_service._iso_values(base.custom_dates)],
        holiday_dates=payload.holiday_dates
        if payload.holiday_dates is not None
        else [date.fromisoformat(item) for item in timetable_service._iso_values(base.holiday_dates)],
        exclude_holidays=payload.exclude_holidays
        if payload.exclude_holidays is not None
        else base.exclude_holidays,
        monthly_mode=payload.monthly_mode or base.monthly_mode or "date",  # type: ignore[arg-type]
    )
    class_ = _resolve_class(db, merged)
    rules = _build_rules(db, merged, class_)
    for rule in rules:
        rule.schedule_group_id = group_id
    conflicts = _validate_rules(db, rules)
    _raise_conflicts(conflicts)
    before = [class_service.schedule_to_out(db, item).model_dump(mode="json") for item in current]
    db.execute(delete(Schedule).where(Schedule.schedule_group_id == group_id))
    db.add_all(rules)
    db.flush()
    write_audit_log(
        db,
        action="schedule_group.update",
        entity_type="schedule",
        entity_id=group_id,
        actor=actor,
        before={"items": before},
        after={"group_id": group_id, "rules": len(rules)},
        request=request,
    )
    db.commit()
    return _group_out(db, group_id)


@router.delete("/timetable/schedules/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_timetable_schedule(
    group_id: str, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Response:
    current = db.scalars(select(Schedule).where(Schedule.schedule_group_id == group_id)).all()
    if not current:
        raise AppError(404, "not_found", "Schedule group not found")
    write_audit_log(
        db,
        action="schedule_group.delete",
        entity_type="schedule",
        entity_id=group_id,
        actor=actor,
        before={"rules": len(current)},
        request=request,
    )
    db.execute(delete(Schedule).where(Schedule.schedule_group_id == group_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _classroom_out(db: Session, classroom: Classroom) -> ClassroomOut:
    count = int(
        db.scalar(
            select(func.count()).select_from(Schedule).where(Schedule.classroom_id == classroom.id)
        )
        or 0
    )
    return ClassroomOut(
        id=classroom.id,
        name=classroom.name,
        building=classroom.building,
        room=classroom.room,
        room_type=classroom.room_type,
        capacity=classroom.capacity,
        latitude=classroom.latitude,
        longitude=classroom.longitude,
        radius_override_meters=classroom.radius_override_meters,
        is_active=classroom.is_active,
        scheduled_classes=count,
        created_at=classroom.created_at,
    )


def _holiday_out(holiday: AcademicHoliday) -> HolidayOut:
    return HolidayOut(
        id=holiday.id,
        name=holiday.name,
        holiday_date=holiday.holiday_date,
        holiday_type=holiday.holiday_type,
        description=holiday.description,
        created_at=holiday.created_at,
    )


@router.get("/classrooms", response_model=Page[ClassroomOut])
def list_admin_classrooms(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    room_type: str | None = None,
    is_active: bool | None = None,
) -> Page[ClassroomOut]:
    query = select(Classroom)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(Classroom.name.ilike(pattern), Classroom.building.ilike(pattern), Classroom.room.ilike(pattern))
        )
    if room_type:
        query = query.where(Classroom.room_type == room_type)
    if is_active is not None:
        query = query.where(Classroom.is_active == is_active)
    total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = db.scalars(query.order_by(Classroom.name.asc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page[ClassroomOut](
        items=[_classroom_out(db, row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("/classrooms", response_model=ClassroomOut, status_code=status.HTTP_201_CREATED)
def create_classroom(
    payload: ClassroomCreate, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> ClassroomOut:
    _check_unique(db, Classroom, Classroom.name, payload.name, "Classroom name")
    classroom = Classroom(
        id=new_uuid(),
        name=payload.name,
        building=payload.building,
        room=payload.room,
        room_type=payload.room_type,
        capacity=payload.capacity,
        latitude=payload.latitude,
        longitude=payload.longitude,
        radius_override_meters=payload.radius_override_meters,
        is_active=payload.is_active,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(classroom)
    db.flush()
    write_audit_log(
        db,
        action="classroom.create",
        entity_type="classroom",
        entity_id=classroom.id,
        actor=actor,
        after={"name": classroom.name, "capacity": classroom.capacity},
        request=request,
    )
    db.commit()
    db.refresh(classroom)
    return _classroom_out(db, classroom)


@router.patch("/classrooms/{classroom_id}", response_model=ClassroomOut)
def update_classroom(
    classroom_id: str,
    payload: ClassroomUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> ClassroomOut:
    classroom = _get_or_404(db, Classroom, classroom_id, "Classroom")
    if payload.name:
        _check_unique(db, Classroom, Classroom.name, payload.name, "Classroom name", classroom_id)
    before = _apply(classroom, payload)
    classroom.updated_at = utcnow()
    write_audit_log(
        db,
        action="classroom.update",
        entity_type="classroom",
        entity_id=classroom_id,
        actor=actor,
        before=before,
        after={"name": classroom.name, "capacity": classroom.capacity},
        request=request,
    )
    db.commit()
    return _classroom_out(db, classroom)


@router.delete("/classrooms/{classroom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_classroom(
    classroom_id: str, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Response:
    classroom = _get_or_404(db, Classroom, classroom_id, "Classroom")
    used = db.scalar(select(func.count()).select_from(Schedule).where(Schedule.classroom_id == classroom_id)) or 0
    if used:
        raise AppError(409, "conflict", "Classroom is assigned to scheduled classes and cannot be deleted")
    write_audit_log(
        db,
        action="classroom.delete",
        entity_type="classroom",
        entity_id=classroom_id,
        actor=actor,
        before={"name": classroom.name},
        request=request,
    )
    db.delete(classroom)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/holidays", response_model=Page[HolidayOut])
def list_holidays(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[HolidayOut]:
    total = int(db.scalar(select(func.count()).select_from(AcademicHoliday)) or 0)
    rows = db.scalars(
        select(AcademicHoliday)
        .order_by(AcademicHoliday.holiday_date.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page[HolidayOut](
        items=[_holiday_out(item) for item in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("/holidays", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def create_holiday(
    payload: HolidayCreate, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> AcademicHoliday:
    _check_unique(db, AcademicHoliday, AcademicHoliday.holiday_date, payload.holiday_date, "Holiday date")
    holiday = AcademicHoliday(
        id=new_uuid(),
        name=payload.name,
        holiday_date=payload.holiday_date,
        holiday_type=payload.holiday_type,
        description=payload.description,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(holiday)
    db.flush()
    write_audit_log(
        db,
        action="holiday.create",
        entity_type="holiday",
        entity_id=holiday.id,
        actor=actor,
        after={"name": holiday.name, "date": str(holiday.holiday_date)},
        request=request,
    )
    db.commit()
    db.refresh(holiday)
    return holiday


@router.patch("/holidays/{holiday_id}", response_model=HolidayOut)
def update_holiday(
    holiday_id: str,
    payload: HolidayUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> AcademicHoliday:
    holiday = _get_or_404(db, AcademicHoliday, holiday_id, "Holiday")
    if payload.holiday_date:
        _check_unique(
            db, AcademicHoliday, AcademicHoliday.holiday_date, payload.holiday_date, "Holiday date", holiday_id
        )
    before = _apply(holiday, payload)
    holiday.updated_at = utcnow()
    write_audit_log(
        db,
        action="holiday.update",
        entity_type="holiday",
        entity_id=holiday_id,
        actor=actor,
        before=before,
        request=request,
    )
    db.commit()
    return holiday


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(
    holiday_id: str, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Response:
    holiday = _get_or_404(db, AcademicHoliday, holiday_id, "Holiday")
    write_audit_log(
        db,
        action="holiday.delete",
        entity_type="holiday",
        entity_id=holiday_id,
        actor=actor,
        before={"name": holiday.name},
        request=request,
    )
    db.delete(holiday)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _subject_out(db: Session, course: Course) -> SubjectOut:
    semester_ids = list(
        db.scalars(
            select(course_semesters.c.semester_id).where(course_semesters.c.course_id == course.id)
        ).all()
    )
    professor_ids = list(
        db.scalars(
            select(course_professors.c.professor_id).where(course_professors.c.course_id == course.id)
        ).all()
    )
    department = db.get(Department, course.department_id)
    return SubjectOut(
        id=course.id,
        code=course.code,
        name=course.name,
        credits=course.credits,
        course_type=course.course_type,
        department_id=course.department_id,
        department_name=department.name if department else None,
        description=course.description,
        semester_ids=semester_ids,
        eligible_professor_ids=professor_ids,
        created_at=course.created_at,
    )


@router.get("/subjects", response_model=Page[SubjectOut])
def list_subjects(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    department_id: str | None = None,
    semester_id: str | None = None,
    search: str | None = Query(None, max_length=100),
) -> Page[SubjectOut]:
    query = select(Course)
    if department_id:
        query = query.where(Course.department_id == department_id)
    if semester_id:
        query = query.where(
            Course.id.in_(select(course_semesters.c.course_id).where(course_semesters.c.semester_id == semester_id))
        )
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Course.code.ilike(pattern), Course.name.ilike(pattern)))
    total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = db.scalars(query.order_by(Course.code.asc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page[SubjectOut](
        items=[_subject_out(db, row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


def _sync_subject_links(
    db: Session, course_id: str, semester_ids: list[str] | None, professor_ids: list[str] | None
) -> None:
    if semester_ids is not None:
        for semester_id in semester_ids:
            _get_or_404(db, Semester, semester_id, "Semester")
        db.execute(delete(course_semesters).where(course_semesters.c.course_id == course_id))
        for semester_id in set(semester_ids):
            db.execute(
                course_semesters.insert().values(
                    course_id=course_id, semester_id=semester_id, created_at=utcnow()
                )
            )
    if professor_ids is not None:
        for professor_id in professor_ids:
            _get_or_404(db, Professor, professor_id, "Teacher")
        db.execute(delete(course_professors).where(course_professors.c.course_id == course_id))
        for professor_id in set(professor_ids):
            db.execute(
                course_professors.insert().values(
                    course_id=course_id, professor_id=professor_id, created_at=utcnow()
                )
            )


@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> SubjectOut:
    _check_unique(db, Course, Course.code, payload.code, "Subject code")
    _get_or_404(db, Department, payload.department_id, "Department")
    course = Course(
        id=new_uuid(),
        code=payload.code,
        name=payload.name,
        credits=payload.credits,
        course_type=payload.course_type,
        department_id=payload.department_id,
        description=payload.description,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(course)
    db.flush()
    _sync_subject_links(db, course.id, payload.semester_ids, payload.eligible_professor_ids)
    write_audit_log(
        db,
        action="subject.create",
        entity_type="course",
        entity_id=course.id,
        actor=actor,
        after={"code": course.code, "name": course.name, "course_type": course.course_type},
        request=request,
    )
    db.commit()
    db.refresh(course)
    return _subject_out(db, course)


@router.get("/subjects/{subject_id}", response_model=SubjectOut)
def get_subject(subject_id: str, db: DB_Dependency) -> SubjectOut:
    return _subject_out(db, _get_or_404(db, Course, subject_id, "Subject"))


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: str,
    payload: SubjectUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> SubjectOut:
    course = _get_or_404(db, Course, subject_id, "Subject")
    if payload.code:
        _check_unique(db, Course, Course.code, payload.code, "Subject code", subject_id)
    if payload.department_id:
        _get_or_404(db, Department, payload.department_id, "Department")
    before = _apply(course, payload, skip={"semester_ids", "eligible_professor_ids"})
    _sync_subject_links(db, subject_id, payload.semester_ids, payload.eligible_professor_ids)
    course.updated_at = utcnow()
    write_audit_log(
        db,
        action="subject.update",
        entity_type="course",
        entity_id=subject_id,
        actor=actor,
        before=before,
        request=request,
    )
    db.commit()
    return _subject_out(db, course)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: str, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Response:
    course = _get_or_404(db, Course, subject_id, "Subject")
    used = db.scalar(select(func.count()).select_from(Class_).where(Class_.course_id == subject_id)) or 0
    if used:
        raise AppError(409, "conflict", "Subject has classes and cannot be deleted")
    write_audit_log(
        db,
        action="subject.delete",
        entity_type="course",
        entity_id=subject_id,
        actor=actor,
        before={"code": course.code, "name": course.name},
        request=request,
    )
    db.delete(course)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/subjects/{subject_id}/semesters", response_model=SubjectOut)
def set_subject_semesters(
    subject_id: str,
    payload: SemesterAssignmentIn,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> SubjectOut:
    subject = _get_or_404(db, Course, subject_id, "Subject")
    _sync_subject_links(db, subject_id, payload.semester_ids, None)
    write_audit_log(
        db,
        action="subject.semesters",
        entity_type="course",
        entity_id=subject_id,
        actor=actor,
        after={"semester_ids": payload.semester_ids},
        request=request,
    )
    db.commit()
    return _subject_out(db, subject)


@router.put("/subjects/{subject_id}/professors", response_model=SubjectOut)
def set_subject_professors(
    subject_id: str,
    payload: ProfessorAssignmentIn,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> SubjectOut:
    subject = _get_or_404(db, Course, subject_id, "Subject")
    _sync_subject_links(db, subject_id, None, payload.professor_ids)
    write_audit_log(
        db,
        action="subject.professors",
        entity_type="course",
        entity_id=subject_id,
        actor=actor,
        after={"professor_ids": payload.professor_ids},
        request=request,
    )
    db.commit()
    return _subject_out(db, subject)


@router.get("/departments/{department_id}/details", response_model=DepartmentDetailOut)
def department_details(department_id: str, db: DB_Dependency) -> DepartmentDetailOut:
    department = _get_or_404(db, Department, department_id, "Department")
    teachers = db.scalars(select(Professor).where(Professor.department_id == department_id)).all()
    courses = db.scalars(select(Course).where(Course.department_id == department_id)).all()
    classes = db.scalars(select(Class_).where(Class_.department_id == department_id)).all()
    semesters = db.scalars(select(Semester).where(Semester.department_id == department_id)).all()
    faculty_items = []
    for teacher in teachers:
        user = db.get(User, teacher.user_id)
        faculty_items.append(
            FacultyOut(
                id=teacher.id,
                user_id=teacher.user_id,
                email=user.email if user else "",
                full_name=user.full_name if user else "",
                employee_id=teacher.employee_id,
                department_id=teacher.department_id,
                department_name=department.name,
                title=teacher.title,
                office=teacher.office,
                is_active=user.is_active if user else False,
                course_count=int(
                    db.scalar(
                        select(func.count()).select_from(course_professors).where(
                            course_professors.c.professor_id == teacher.id
                        )
                    )
                    or 0
                ),
                class_count=int(
                    db.scalar(select(func.count()).select_from(Class_).where(Class_.professor_id == teacher.id)) or 0
                ),
                created_at=teacher.created_at,
            )
        )
    return DepartmentDetailOut(
        id=department.id,
        name=department.name,
        code=department.code,
        description=department.description,
        teachers=faculty_items,
        subjects=[_subject_out(db, course) for course in courses],
        classes=[class_service.class_to_out(db, class_) for class_ in classes],
        semesters=[_semester_out(db, semester) for semester in semesters],
        created_at=department.created_at,
    )


def _semester_out(db: Session, semester: Semester) -> SemesterOut:
    count = int(db.scalar(select(func.count()).select_from(Class_).where(Class_.semester_id == semester.id)) or 0)
    department = db.get(Department, semester.department_id) if semester.department_id else None
    today = date.today()
    return SemesterOut(
        id=semester.id,
        name=semester.name,
        code=semester.code,
        number=semester.number,
        academic_year=semester.academic_year,
        session=semester.session,
        department_id=semester.department_id,
        department_name=department.name if department else None,
        program=semester.program,
        start_date=semester.start_date,
        end_date=semester.end_date,
        registration_start=semester.registration_start,
        registration_end=semester.registration_end,
        exam_start=semester.exam_start,
        exam_end=semester.exam_end,
        is_active=semester.is_active,
        class_count=count,
        is_current=bool(
            semester.start_date and semester.end_date and semester.start_date <= today <= semester.end_date
        ),
        created_at=semester.created_at,
    )


@router.patch("/faculty/{professor_id}", response_model=FacultyOut)
def update_faculty(
    professor_id: str,
    payload: FacultyUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> FacultyOut:
    professor = _get_or_404(db, Professor, professor_id, "Teacher")
    user = _get_or_404(db, User, professor.user_id, "User")
    if payload.department_id:
        _get_or_404(db, Department, payload.department_id, "Department")
    before = _apply(professor, payload, skip={"is_active"})
    if payload.is_active is not None:
        before["is_active"] = user.is_active
        user.is_active = payload.is_active
        user.updated_at = utcnow()
    professor.updated_at = utcnow()
    write_audit_log(
        db,
        action="faculty.update",
        entity_type="professor",
        entity_id=professor_id,
        actor=actor,
        before=before,
        request=request,
    )
    db.commit()
    return FacultyOut(
        id=professor.id,
        user_id=professor.user_id,
        email=user.email,
        full_name=user.full_name,
        employee_id=professor.employee_id,
        department_id=professor.department_id,
        title=professor.title,
        office=professor.office,
        is_active=user.is_active,
        created_at=professor.created_at,
    )


@router.get("/faculty/{professor_id}/classes", response_model=Page[ClassOut])
def faculty_classes(
    professor_id: str,
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[ClassOut]:
    _get_or_404(db, Professor, professor_id, "Teacher")
    query = select(Class_).where(
        or_(Class_.professor_id == professor_id, Class_.id.in_(select(class_professors.c.class_id).where(class_professors.c.professor_id == professor_id)))
    )
    total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = db.scalars(query.order_by(Class_.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page[ClassOut](
        items=[class_service.class_to_out(db, row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/faculty/{professor_id}/timetable", response_model=Page[TimetableEntryOut])
def faculty_timetable(
    professor_id: str,
    db: DB_Dependency,
    from_date: date | None = None,
    to_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
) -> Page[TimetableEntryOut]:
    _get_or_404(db, Professor, professor_id, "Teacher")
    start = from_date or date.today()
    end = to_date or start + timedelta(days=30)
    schedules = _filtered_schedules(
        db,
        department_id=None,
        semester_id=None,
        professor_id=professor_id,
        classroom_id=None,
        course_id=None,
        class_id=None,
        class_type=None,
    )
    entries = timetable_service.build_entries(db, schedules, start, end)
    total = len(entries)
    offset = (page - 1) * page_size
    return Page[TimetableEntryOut](
        items=entries[offset : offset + page_size],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )
