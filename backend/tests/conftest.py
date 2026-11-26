from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-with-at-least-32-characters")
os.environ.setdefault("FACE_ENCRYPTION_KEY", "test-only-face-encryption-key-1234567890")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "1000")
os.environ.setdefault("ALLOW_DEV_SECRETS", "0")

from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import (
    AttendanceSession,
    Class_,
    Classroom,
    Course,
    Department,
    Enrollment,
    Professor,
    Semester,
    Student,
    User,
)
from app.utils.uuid import new_uuid, utcnow

limiter.enabled = False


@pytest.fixture()
def db_session() -> Iterator[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    with factory() as session:
        yield session
    engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        yield db_session

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_user(
    db: Session,
    *,
    email: str,
    password: str = "Pass123!",
    role: str = "student",
    full_name: str = "Test User",
    university_id: str | None = None,
    employee_id: str | None = None,
    department_id: str | None = None,
) -> User:
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
    if role == "student":
        db.add(
            Student(
                id=new_uuid(),
                user_id=user.id,
                university_id=university_id or email.split("@")[0].upper(),
                department_id=department_id,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    elif role == "professor":
        db.add(
            Professor(
                id=new_uuid(),
                user_id=user.id,
                employee_id=employee_id or email.split("@")[0].upper(),
                department_id=department_id,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    db.flush()
    return user


def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_academic_data(db: Session) -> dict[str, object]:
    department = Department(
        id=new_uuid(), name="Computer Science", code="CS", created_at=utcnow(), updated_at=utcnow()
    )
    course = Course(
        id=new_uuid(),
        code="CS101",
        name="Intro to Programming",
        credits=3,
        department_id=department.id,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    semester = Semester(
        id=new_uuid(),
        name="Fall 2026",
        code="F2026",
        academic_year="2026",
        is_active=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    classroom = Classroom(
        id=new_uuid(),
        name="Lab A",
        building="Main",
        room="A-101",
        latitude=37.7749,
        longitude=-122.4194,
        radius_override_meters=100,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add_all([department, course, classroom, semester])
    db.flush()

    professor_user = create_user(
        db,
        email="prof@university.edu",
        password="Professor123!",
        role="professor",
        full_name="Dr. Smith",
        employee_id="EMP-001",
        department_id=department.id,
    )
    enrolled_user = create_user(
        db,
        email="enrolled@university.edu",
        password="Student123!",
        role="student",
        full_name="Enrolled Student",
        university_id="STU-001",
        department_id=department.id,
    )
    other_user = create_user(
        db,
        email="other@university.edu",
        password="Student123!",
        role="student",
        full_name="Other Student",
        university_id="STU-002",
        department_id=department.id,
    )
    professor = db.query(Professor).filter(Professor.user_id == professor_user.id).one()
    enrolled = db.query(Student).filter(Student.user_id == enrolled_user.id).one()
    other = db.query(Student).filter(Student.user_id == other_user.id).one()

    class_ = Class_(
        id=new_uuid(),
        course_id=course.id,
        professor_id=professor.id,
        department_id=department.id,
        semester_id=semester.id,
        section="A",
        term="Fall 2026",
        capacity=30,
        is_active=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(class_)
    db.flush()
    db.add(
        Enrollment(
            id=new_uuid(),
            class_id=class_.id,
            student_id=enrolled.id,
            status="enrolled",
            created_at=utcnow() - timedelta(hours=1),
            updated_at=utcnow(),
        )
    )
    db.flush()
    return {
        "department": department,
        "course": course,
        "classroom": classroom,
        "semester": semester,
        "class": class_,
        "professor_user": professor_user,
        "professor": professor,
        "enrolled_user": enrolled_user,
        "enrolled": enrolled,
        "other_user": other_user,
        "other": other,
    }


def create_session_record(db: Session, data: dict[str, object], **overrides: object) -> AttendanceSession:
    now = utcnow()
    values: dict[str, object] = {
        "id": new_uuid(),
        "class_id": data["class"].id,
        "classroom_id": data["classroom"].id,
        "professor_id": data["professor"].id,
        "starts_at": now - timedelta(minutes=5),
        "ends_at": now + timedelta(hours=1),
        "status": "scheduled",
        "require_face": False,
        "require_location": True,
        "late_minutes": 10,
        "qr_validity_seconds": 60,
        "qr_refresh_seconds": 30,
        "created_at": now,
        "updated_at": now,
    }
    values.update(overrides)
    session = AttendanceSession(**values)
    db.add(session)
    db.flush()
    return session


def start_session_via_api(client: TestClient, session_id: str, headers: dict[str, str]) -> dict[str, str]:
    response = client.post(f"/api/v1/sessions/{session_id}/start", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["qr"]["qr_payload"]


def qr_payload(token: str) -> str:
    return f"uat:v1:{token}" if not token.startswith("uat:v1:") else token
