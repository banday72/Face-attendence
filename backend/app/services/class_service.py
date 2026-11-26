from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Class_,
    Classroom,
    Course,
    Department,
    Enrollment,
    Professor,
    Schedule,
    Semester,
    User,
    class_professors,
)
from app.schemas.admin import ClassOut, ScheduleOut

DAY_LABELS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def professor_class_filter(professor_id: str):
    assigned = select(class_professors.c.class_id).where(
        class_professors.c.professor_id == professor_id
    )
    return or_(Class_.professor_id == professor_id, Class_.id.in_(assigned))


def _professor_name(db: Session, professor_id: str | None) -> str | None:
    if not professor_id:
        return None
    professor = db.get(Professor, professor_id)
    if professor is None:
        return None
    user = db.get(User, professor.user_id)
    return user.full_name if user else None


def _display_name(class_: Class_, course: Course | None) -> str:
    if class_.name:
        return class_.name
    if course:
        return f"{course.code}-{class_.section}"
    return class_.section


def class_to_out(db: Session, class_: Class_) -> ClassOut:
    schedules = db.scalars(
        select(Schedule)
        .where(Schedule.class_id == class_.id)
        .order_by(Schedule.day_of_week, Schedule.start_time)
    ).all()
    course = db.get(Course, class_.course_id)
    semester = db.get(Semester, class_.semester_id) if class_.semester_id else None
    classroom = None
    if schedules and schedules[0].classroom_id:
        classroom = db.get(Classroom, schedules[0].classroom_id)
    enrolled_count = int(
        db.scalar(
            select(func.count())
            .select_from(Enrollment)
            .where(Enrollment.class_id == class_.id, Enrollment.status == "enrolled")
        )
        or 0
    )
    days = list(dict.fromkeys(DAY_LABELS[row.day_of_week] for row in schedules if 0 <= row.day_of_week <= 6))
    return ClassOut(
        id=class_.id,
        course_id=class_.course_id,
        professor_id=class_.professor_id,
        department_id=class_.department_id,
        semester_id=class_.semester_id,
        section=class_.section,
        term=class_.term,
        semester=semester.name if semester else None,
        academic_year=semester.academic_year if semester else None,
        name=_display_name(class_, course),
        capacity=class_.capacity,
        is_active=class_.is_active,
        created_at=class_.created_at,
        course_name=course.name if course else None,
        professor_name=_professor_name(db, class_.professor_id),
        classroom_id=classroom.id if classroom else None,
        classroom_name=classroom.name if classroom else None,
        schedule_days=days,
        start_time=schedules[0].start_time if schedules else None,
        end_time=schedules[0].end_time if schedules else None,
        enrolled_count=enrolled_count,
    )


def schedule_to_out(db: Session, schedule: Schedule) -> ScheduleOut:
    class_ = db.get(Class_, schedule.class_id)
    course_id = schedule.course_id or (class_.course_id if class_ else None)
    course = db.get(Course, course_id) if course_id else None
    classroom = db.get(Classroom, schedule.classroom_id) if schedule.classroom_id else None
    professor_id = schedule.professor_id or (class_.professor_id if class_ else None)
    department_id = schedule.department_id or (class_.department_id if class_ else None)
    semester_id = schedule.semester_id or (class_.semester_id if class_ else None)
    department = db.get(Department, department_id) if department_id else None
    semester = db.get(Semester, semester_id) if semester_id else None
    def parse_dates(values: object) -> list[date]:
        source = values if isinstance(values, (list, tuple)) else []
        return [date.fromisoformat(str(item)[:10]) for item in source]

    def parse_ints(values: object) -> list[int]:
        source = values if isinstance(values, (list, tuple)) else []
        return [int(item) for item in source]

    return ScheduleOut(
        id=schedule.id,
        class_id=schedule.class_id,
        class_name=_display_name(class_, course) if class_ else None,
        course_id=course_id,
        course_name=course.name if course else None,
        professor_id=professor_id,
        professor_name=_professor_name(db, professor_id) if professor_id else None,
        classroom_id=classroom.id if classroom else None,
        classroom_name=classroom.name if classroom else None,
        department_id=department_id,
        department_name=department.name if department else None,
        semester_id=semester_id,
        semester_name=semester.name if semester else None,
        schedule_group_id=schedule.schedule_group_id,
        class_type=schedule.class_type,
        notes=schedule.notes,
        recurrence_type=schedule.recurrence_type,
        start_date=schedule.start_date,
        end_date=schedule.end_date,
        repeat_days=parse_ints(schedule.repeat_days),
        custom_dates=parse_dates(schedule.custom_dates),
        holiday_dates=parse_dates(schedule.holiday_dates),
        exclude_holidays=schedule.exclude_holidays,
        monthly_mode=schedule.monthly_mode,
        day_of_week=schedule.day_of_week,
        start_time=schedule.start_time,
        end_time=schedule.end_time,
        created_at=schedule.created_at,
    )
