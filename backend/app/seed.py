from __future__ import annotations

from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models import (
    Class_,
    Classroom,
    Course,
    Department,
    Enrollment,
    Professor,
    Schedule,
    Student,
    User,
)
from app.utils.uuid import new_uuid, utcnow


def ensure_seed_allowed() -> None:
    if settings.environment not in {"development", "dev", "local"} and not settings.force_seed:
        raise RuntimeError("Seeding is disabled outside development unless FORCE_SEED=1 is set")


def _get_or_create_user(
    db: Session,
    *,
    email: str,
    password: str,
    full_name: str,
    role: str,
) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user:
        return user
    user = User(
        id=new_uuid(),
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        role=role,
        is_active=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(user)
    db.flush()
    return user


def _get_or_create_department(db: Session, name: str, code: str) -> Department:
    department = db.scalar(select(Department).where(Department.code == code))
    if department:
        return department
    department = Department(
        id=new_uuid(), name=name, code=code, description=f"{name} department", created_at=utcnow(), updated_at=utcnow()
    )
    db.add(department)
    db.flush()
    return department


def _get_or_create_course(db: Session, department: Department, code: str, name: str, credits: int) -> Course:
    course = db.scalar(select(Course).where(Course.code == code))
    if course:
        return course
    course = Course(
        id=new_uuid(),
        code=code,
        name=name,
        credits=credits,
        department_id=department.id,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(course)
    db.flush()
    return course


def _get_or_create_class(
    db: Session,
    *,
    course: Course,
    professor: Professor,
    section: str,
    term: str,
) -> Class_:
    class_ = db.scalar(select(Class_).where(Class_.course_id == course.id, Class_.section == section, Class_.term == term))
    if class_:
        return class_
    class_ = Class_(
        id=new_uuid(),
        course_id=course.id,
        professor_id=professor.id,
        department_id=course.department_id,
        section=section,
        term=term,
        name=f"{course.code} {section}",
        capacity=60,
        is_active=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(class_)
    db.flush()
    return class_


def seed_database(db: Session | None = None) -> dict[str, int]:
    ensure_seed_allowed()
    owns_session = db is None
    session = db or SessionLocal()
    if owns_session:
        Base.metadata.create_all(bind=engine)
    try:
        cs = _get_or_create_department(session, "Computer Science", "CS")
        math = _get_or_create_department(session, "Mathematics", "MATH")

        intro = _get_or_create_course(session, cs, "CS101", "Introduction to Programming", 3)
        structures = _get_or_create_course(session, cs, "CS201", "Data Structures", 4)
        calculus = _get_or_create_course(session, math, "MATH101", "Calculus I", 3)

        classroom_a = classroom_b = None
        for name, building, room, lat, lon in [
            ("Main Hall A-101", "Main Hall", "A-101", 37.774900, -122.419400),
            ("Science Block B-202", "Science Block", "B-202", 37.775250, -122.418950),
        ]:
            classroom = session.scalar(select(Classroom).where(Classroom.name == name))
            if classroom is None:
                classroom = Classroom(
                    id=new_uuid(),
                    name=name,
                    building=building,
                    room=room,
                    latitude=lat,
                    longitude=lon,
                    radius_override_meters=100,
                    is_active=True,
                    created_at=utcnow(),
                    updated_at=utcnow(),
                )
                session.add(classroom)
                session.flush()
            if classroom_a is None:
                classroom_a = classroom
            else:
                classroom_b = classroom

        _get_or_create_user(session, email="admin@university.edu", password="Admin123!", full_name="System Administrator", role="admin")
        professor_user = _get_or_create_user(session, email="professor@university.edu", password="Professor123!", full_name="Dr. Jane Smith", role="professor")
        second_professor_user = _get_or_create_user(session, email="professor2@university.edu", password="Professor123!", full_name="Dr. Alan Turing", role="professor")

        professors = []
        for user, employee_id, title in [
            (professor_user, "EMP-001", "Associate Professor"),
            (second_professor_user, "EMP-002", "Assistant Professor"),
        ]:
            professor = session.scalar(select(Professor).where(Professor.user_id == user.id))
            if professor is None:
                professor = Professor(
                    id=new_uuid(),
                    user_id=user.id,
                    employee_id=employee_id,
                    department_id=cs.id,
                    title=title,
                    office="Faculty Office",
                    created_at=utcnow(),
                    updated_at=utcnow(),
                )
                session.add(professor)
                session.flush()
            professors.append(professor)

        students: list[Student] = []
        student_specs = [
            ("student@university.edu", "STU-001", "Alice Johnson"),
            ("student2@university.edu", "STU-002", "Bob Williams"),
            ("student3@university.edu", "STU-003", "Carol Davis"),
            ("student4@university.edu", "STU-004", "David Miller"),
            ("student5@university.edu", "STU-005", "Eve Wilson"),
        ]
        for email, university_id, full_name in student_specs:
            user = _get_or_create_user(session, email=email, password="Student123!", full_name=full_name, role="student")
            student = session.scalar(select(Student).where(Student.user_id == user.id))
            if student is None:
                student = Student(
                    id=new_uuid(),
                    user_id=user.id,
                    university_id=university_id,
                    department_id=cs.id,
                    program="BSc Computer Science",
                    year_level=2,
                    created_at=utcnow(),
                    updated_at=utcnow(),
                )
                session.add(student)
                session.flush()
            students.append(student)

        class_a = _get_or_create_class(db=session, course=intro, professor=professors[0], section="A", term="Fall-2026")
        class_b = _get_or_create_class(db=session, course=structures, professor=professors[1], section="A", term="Fall-2026")
        _get_or_create_class(db=session, course=calculus, professor=professors[0], section="B", term="Fall-2026")

        for class_ in (class_a, class_b):
            for student in students:
                exists = session.scalar(
                    select(Enrollment).where(Enrollment.class_id == class_.id, Enrollment.student_id == student.id)
                )
                if exists is None:
                    session.add(
                        Enrollment(
                            id=new_uuid(),
                            class_id=class_.id,
                            student_id=student.id,
                            status="enrolled",
                            created_at=utcnow(),
                            updated_at=utcnow(),
                        )
                    )

        for class_, classroom, day, start, end in [
            (class_a, classroom_a, 0, time(9, 0), time(10, 30)),
            (class_b, classroom_b, 2, time(11, 0), time(12, 30)),
        ]:
            schedule_exists = session.scalar(
                select(Schedule).where(Schedule.class_id == class_.id, Schedule.day_of_week == day, Schedule.start_time == start)
            )
            if schedule_exists is None:
                session.add(
                    Schedule(
                        id=new_uuid(),
                        class_id=class_.id,
                        classroom_id=classroom.id if classroom else None,
                        day_of_week=day,
                        start_time=start,
                        end_time=end,
                        created_at=utcnow(),
                        updated_at=utcnow(),
                    )
                )

        session.commit()
        return {
            "departments": 2,
            "courses": 3,
            "classrooms": 2,
            "users": 8,
            "professors": 2,
            "students": 5,
            "classes": 3,
            "enrollments": 10,
            "schedules": 2,
        }
    finally:
        if owns_session:
            session.close()


if __name__ == "__main__":
    result = seed_database()
    print(result)
