from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Class_, Classroom, Course, Enrollment, Professor, Schedule, User
from app.schemas.admin import ClassOut, ScheduleOut

DAY_LABELS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


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
        section=class_.section,
        term=class_.term,
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
    course = db.get(Course, class_.course_id) if class_ else None
    classroom = db.get(Classroom, schedule.classroom_id) if schedule.classroom_id else None
    return ScheduleOut(
        id=schedule.id,
        class_id=schedule.class_id,
        class_name=_display_name(class_, course) if class_ else None,
        course_id=class_.course_id if class_ else None,
        course_name=course.name if course else None,
        professor_name=_professor_name(db, class_.professor_id) if class_ else None,
        classroom_id=classroom.id if classroom else None,
        classroom_name=classroom.name if classroom else None,
        day_of_week=schedule.day_of_week,
        start_time=schedule.start_time,
        end_time=schedule.end_time,
        created_at=schedule.created_at,
    )
