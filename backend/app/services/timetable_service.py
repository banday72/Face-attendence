from __future__ import annotations

import calendar
from collections.abc import Iterable
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AcademicHoliday,
    Class_,
    Classroom,
    Course,
    Department,
    Enrollment,
    Professor,
    Schedule,
    Semester,
)
from app.schemas.timetable import ConflictOut, TimetableEntryOut

DAY_LABELS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
MAX_WINDOW_DAYS = 730


def _iso_values(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value]
    return []


def _parse_dates(value: object) -> list[date]:
    result: list[date] = []
    for raw in _iso_values(value):
        try:
            result.append(date.fromisoformat(str(raw)[:10]))
        except ValueError:
            continue
    return result


def _nth_weekday(year: int, month: int, weekday: int, nth: int) -> date:
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    day = 1 + offset + (nth - 1) * 7
    last = calendar.monthrange(year, month)[1]
    if day > last:
        day = 1 + offset + 7 * (nth - 2)
    return date(year, month, max(1, day))


def occurrence_dates(
    schedule: Schedule,
    from_date: date | None = None,
    to_date: date | None = None,
    global_holidays: set[date] | None = None,
) -> list[date]:
    """Materialize the dates on which a schedule rule actually occurs."""
    start = schedule.start_date
    end = schedule.end_date
    if start is None:
        start = from_date or date.today()
    if end is None and schedule.recurrence_type == "semester" and schedule.semester_id:
        semester = getattr(schedule, "_semester_cache", None)
        if semester is not None:
            end = semester.end_date
    if end is None:
        end = start + timedelta(days=365)
    if from_date:
        start = max(start, from_date)
    if to_date:
        end = min(end, to_date)
    if start > end or (end - start).days > MAX_WINDOW_DAYS:
        return []

    kind = schedule.recurrence_type or "weekly"
    dates: list[date] = []
    if kind == "one_time":
        dates = [schedule.start_date] if schedule.start_date else []
    elif kind == "custom":
        dates = _parse_dates(schedule.custom_dates)
    elif kind == "daily":
        dates = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
    elif kind in {"weekly", "semester"}:
        days = _iso_values(schedule.repeat_days)
        if not days:
            days = [str(schedule.day_of_week)]
        allowed = {int(day) for day in days if str(day).isdigit() and 0 <= int(day) <= 6}
        dates = [
            start + timedelta(days=offset)
            for offset in range((end - start).days + 1)
            if (start + timedelta(days=offset)).weekday() in allowed
        ]
    elif kind == "monthly":
        anchor = schedule.start_date or start
        nth = ((anchor.day - 1) // 7) + 1
        cursor = date(start.year, start.month, 1)
        while cursor <= end:
            if (schedule.monthly_mode or "date") == "weekday":
                candidate = _nth_weekday(cursor.year, cursor.month, anchor.weekday(), nth)
            else:
                last = calendar.monthrange(cursor.year, cursor.month)[1]
                candidate = date(cursor.year, cursor.month, min(anchor.day, last))
            if start <= candidate <= end:
                dates.append(candidate)
            cursor = date(cursor.year + (cursor.month == 12), (cursor.month % 12) + 1, 1)

    excluded: set[date] = set(global_holidays or set())
    if schedule.exclude_holidays:
        excluded.update(_parse_dates(schedule.holiday_dates))
    dates = sorted({item for item in dates if item is not None and item not in excluded})
    return [item for item in dates if (from_date is None or item >= from_date) and (to_date is None or item <= to_date)]


def global_holiday_dates(db: Session) -> set[date]:
    return set(db.scalars(select(AcademicHoliday.holiday_date)).all())


class Context:
    """Small lookup cache used while shaping timetable entries."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.classes: dict[str, Class_ | None] = {}
        self.courses: dict[str, Course | None] = {}
        self.professors: dict[str, Professor | None] = {}
        self.classrooms: dict[str, Classroom | None] = {}
        self.departments: dict[str, Department | None] = {}
        self.semesters: dict[str, Semester | None] = {}

    def get(self, cache: dict, entity_id: str | None, model: type) -> object | None:
        if not entity_id:
            return None
        if entity_id not in cache:
            cache[entity_id] = self.db.get(model, entity_id)
        return cache[entity_id]

    def class_(self, entity_id: str) -> Class_ | None:
        return self.get(self.classes, entity_id, Class_)  # type: ignore[return-value]

    def course(self, entity_id: str | None) -> Course | None:
        return self.get(self.courses, entity_id, Course)  # type: ignore[return-value]

    def professor(self, entity_id: str | None) -> Professor | None:
        return self.get(self.professors, entity_id, Professor)  # type: ignore[return-value]

    def classroom(self, entity_id: str | None) -> Classroom | None:
        return self.get(self.classrooms, entity_id, Classroom)  # type: ignore[return-value]

    def department(self, entity_id: str | None) -> Department | None:
        return self.get(self.departments, entity_id, Department)  # type: ignore[return-value]

    def semester(self, entity_id: str | None) -> Semester | None:
        return self.get(self.semesters, entity_id, Semester)  # type: ignore[return-value]


def effective_professor_id(schedule: Schedule, ctx: Context) -> str | None:
    if schedule.professor_id:
        return schedule.professor_id
    class_ = ctx.class_(schedule.class_id)
    return class_.professor_id if class_ else None


def effective_semester_id(schedule: Schedule, ctx: Context) -> str | None:
    if schedule.semester_id:
        return schedule.semester_id
    class_ = ctx.class_(schedule.class_id)
    return class_.semester_id if class_ else None


def effective_department_id(schedule: Schedule, ctx: Context) -> str | None:
    if schedule.department_id:
        return schedule.department_id
    class_ = ctx.class_(schedule.class_id)
    return class_.department_id if class_ else None


def build_entries(
    db: Session,
    schedules: Iterable[Schedule],
    from_date: date,
    to_date: date,
    holidays: set[date] | None = None,
) -> list[TimetableEntryOut]:
    ctx = Context(db)
    holidays = holidays if holidays is not None else global_holiday_dates(db)
    entries: list[TimetableEntryOut] = []
    for schedule in schedules:
        class_ = ctx.class_(schedule.class_id)
        course_id = schedule.course_id or (class_.course_id if class_ else None)
        course = ctx.course(course_id)
        professor_id = effective_professor_id(schedule, ctx)
        professor = ctx.professor(professor_id)
        classroom = ctx.classroom(schedule.classroom_id)
        department = ctx.department(effective_department_id(schedule, ctx))
        semester = ctx.semester(effective_semester_id(schedule, ctx))
        schedule._semester_cache = semester  # type: ignore[attr-defined]
        for occurrence in occurrence_dates(schedule, from_date, to_date, holidays):
            professor_name = professor.user.full_name if professor and professor.user else None
            entries.append(
                TimetableEntryOut(
                    id=f"{schedule.id}:{occurrence.isoformat()}",
                    schedule_id=schedule.id,
                    group_id=schedule.schedule_group_id,
                    date=occurrence,
                    day_of_week=occurrence.weekday(),
                    start_time=schedule.start_time,
                    end_time=schedule.end_time,
                    class_id=schedule.class_id,
                    class_name=(
                        class_.name
                        if class_ and class_.name
                        else f"{course.code} - {class_.section}"
                        if class_ and course
                        else class_.section
                        if class_
                        else None
                    ),
                    course_id=course_id,
                    course_name=course.name if course else None,
                    course_code=course.code if course else None,
                    professor_id=professor_id,
                    professor_name=professor_name,
                    classroom_id=classroom.id if classroom else None,
                    classroom_name=classroom.name if classroom else None,
                    department_id=department.id if department else None,
                    department_name=department.name if department else None,
                    semester_id=semester.id if semester else None,
                    semester_name=semester.name if semester else None,
                    class_type=schedule.class_type,
                    notes=schedule.notes,
                    recurrence_type=schedule.recurrence_type,
                )
            )
    entries.sort(key=lambda item: (item.date, item.start_time, item.class_name or ""))
    return entries


def _conflict(
    kind: str,
    message: str,
    occurrence: date | None = None,
    schedule_id: str | None = None,
    other_id: str | None = None,
    severity: str = "error",
) -> ConflictOut:
    return ConflictOut(
        type=kind,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
        message=message,
        date=occurrence,
        schedule_id=schedule_id,
        other_schedule_id=other_id,
    )


def conflicts_for_schedule(
    db: Session,
    candidate: Schedule,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[ConflictOut]:
    """Validate a rule (persisted or proposed) against every scheduling constraint."""
    ctx = Context(db)
    class_ = ctx.class_(candidate.class_id)
    professor_id = effective_professor_id(candidate, ctx)
    professor = ctx.professor(professor_id)
    classroom = ctx.classroom(candidate.classroom_id)
    semester = ctx.semester(effective_semester_id(candidate, ctx))
    candidate._semester_cache = semester  # type: ignore[attr-defined]
    holidays = global_holiday_dates(db)
    dates = occurrence_dates(candidate, from_date, to_date, holidays)
    conflicts: list[ConflictOut] = []

    if not dates:
        return conflicts

    if semester:
        outside = [
            item
            for item in dates
            if (semester.start_date and item < semester.start_date)
            or (semester.end_date and item > semester.end_date)
        ]
        if outside:
            conflicts.append(
                _conflict(
                    "semester_range",
                    f"Classes fall outside semester {semester.name} ({semester.start_date} to {semester.end_date}).",
                    outside[0],
                    candidate.id,
                )
            )

    if classroom and classroom.capacity and class_:
        enrolled = int(
            db.scalar(
                select(func.count()).select_from(Enrollment).where(
                    Enrollment.class_id == class_.id, Enrollment.status == "enrolled"
                )
            )
            or 0
        )
        if enrolled > classroom.capacity:
            conflicts.append(
                _conflict(
                    "capacity",
                    f"{classroom.name} holds {classroom.capacity} but {enrolled} students are enrolled.",
                    dates[0],
                    candidate.id,
                    severity="warning",
                )
            )

    others = db.scalars(
        select(Schedule).where(
            Schedule.id != candidate.id,
            Schedule.start_time < candidate.end_time,
            Schedule.end_time > candidate.start_time,
        )
    ).all()
    window_start = min(dates)
    window_end = max(dates)
    seen: set[tuple[str, str, str]] = set()
    for other in others:
        other_dates = set(occurrence_dates(other, window_start, window_end, holidays))
        shared = other_dates.intersection(dates)
        if not shared:
            continue
        occurrence = min(shared)
        other_professor_id = effective_professor_id(other, ctx)
        other_classroom = ctx.classroom(other.classroom_id)
        other_semester_id = effective_semester_id(other, ctx)
        if professor_id and other_professor_id == professor_id:
            key = ("teacher", other.id, occurrence.isoformat())
            if key not in seen:
                seen.add(key)
                name = professor.user.full_name if professor and professor.user else "This teacher"
                conflicts.append(
                    _conflict(
                        "teacher",
                        f"{name} is already scheduled on {occurrence.isoformat()} at {other.start_time:%H:%M}.",
                        occurrence,
                        candidate.id,
                        other.id,
                    )
                )
        if classroom and other_classroom and other_classroom.id == classroom.id:
            key = ("classroom", other.id, occurrence.isoformat())
            if key not in seen:
                seen.add(key)
                conflicts.append(
                    _conflict(
                        "classroom",
                        f"{classroom.name} is already booked on {occurrence.isoformat()} at {other.start_time:%H:%M}.",
                        occurrence,
                        candidate.id,
                        other.id,
                    )
                )
        if (
            effective_semester_id(candidate, ctx)
            and other_semester_id == effective_semester_id(candidate, ctx)
            and other.class_id != candidate.class_id
        ):
            key = ("student_group", other.id, occurrence.isoformat())
            if key not in seen:
                seen.add(key)
                conflicts.append(
                    _conflict(
                        "student_group",
                        f"Another class for this semester overlaps on {occurrence.isoformat()} at {other.start_time:%H:%M}.",
                        occurrence,
                        candidate.id,
                        other.id,
                    )
                )
    return conflicts


def list_conflicts(db: Session, from_date: date, to_date: date) -> list[ConflictOut]:
    schedules = db.scalars(
        select(Schedule).where(
            Schedule.start_date <= to_date,
            or_(Schedule.end_date >= from_date, Schedule.end_date.is_(None)),
        )
    ).all()
    results: list[ConflictOut] = []
    seen_pairs: set[tuple[str, str, str, str]] = set()
    for schedule in schedules:
        for conflict in conflicts_for_schedule(db, schedule, from_date, to_date):
            if conflict.severity != "error" or not conflict.other_schedule_id:
                continue
            first_id, second_id = sorted([schedule.id, conflict.other_schedule_id])
            pair = (
                first_id,
                second_id,
                conflict.type,
                conflict.date.isoformat() if conflict.date else "",
            )
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            results.append(conflict)
    return results
