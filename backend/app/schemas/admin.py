from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field, field_validator

from app.schemas.auth import Role, UserOut, validate_password
from app.schemas.common import ORMModel, StrictModel


class DepartmentCreate(StrictModel):
    name: str = Field(min_length=2, max_length=150)
    code: str = Field(min_length=2, max_length=20)
    description: str | None = Field(default=None, max_length=500)


class DepartmentUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    code: str | None = Field(default=None, min_length=2, max_length=20)
    description: str | None = Field(default=None, max_length=500)


class DepartmentOut(ORMModel):
    id: str
    name: str
    code: str
    description: str | None
    created_at: datetime


class UserCreate(StrictModel):
    email: EmailStr
    password: str
    full_name: str = Field(min_length=2, max_length=150)
    role: Role
    phone: str | None = Field(default=None, max_length=30)
    university_id: str | None = Field(default=None, max_length=50)
    employee_id: str | None = Field(default=None, max_length=50)
    department_id: str | None = None
    program: str | None = Field(default=None, max_length=120)
    year_level: int | None = Field(default=None, ge=1, le=8)
    title: str | None = Field(default=None, max_length=50)
    office: str | None = Field(default=None, max_length=80)

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password(value)

    @field_validator("university_id")
    @classmethod
    def university_id_required_for_students(cls, value: str | None, info: Any) -> str | None:
        if info.data.get("role") == "student" and not value:
            raise ValueError("university_id is required for students")
        return value

    @field_validator("employee_id")
    @classmethod
    def employee_id_required_for_professors(cls, value: str | None, info: Any) -> str | None:
        if info.data.get("role") == "professor" and not value:
            raise ValueError("employee_id is required for professors")
        return value


class UserUpdate(StrictModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None
    password: str | None = None
    department_id: str | None = None

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_password(value)


class UserAdminOut(UserOut):
    department_id: str | None = None
    university_id: str | None = None
    employee_id: str | None = None


class CourseCreate(StrictModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=150)
    credits: int = Field(default=3, ge=1, le=12)
    department_id: str
    description: str | None = Field(default=None, max_length=500)


class CourseUpdate(StrictModel):
    code: str | None = Field(default=None, min_length=2, max_length=30)
    name: str | None = Field(default=None, min_length=2, max_length=150)
    credits: int | None = Field(default=None, ge=1, le=12)
    department_id: str | None = None
    description: str | None = Field(default=None, max_length=500)


class CourseOut(ORMModel):
    id: str
    code: str
    name: str
    credits: int
    department_id: str
    description: str | None
    created_at: datetime


class ClassCreate(StrictModel):
    course_id: str
    professor_id: str | None = None
    department_id: str | None = None
    section: str = Field(min_length=1, max_length=30)
    term: str = Field(min_length=1, max_length=30)
    name: str | None = Field(default=None, max_length=150)
    capacity: int = Field(default=60, ge=1, le=500)
    is_active: bool = True


class ClassUpdate(StrictModel):
    course_id: str | None = None
    professor_id: str | None = None
    department_id: str | None = None
    section: str | None = Field(default=None, min_length=1, max_length=30)
    term: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, max_length=150)
    capacity: int | None = Field(default=None, ge=1, le=500)
    is_active: bool | None = None


class ClassOut(ORMModel):
    id: str
    course_id: str
    professor_id: str | None
    department_id: str | None
    section: str
    term: str
    name: str | None
    capacity: int
    is_active: bool
    created_at: datetime


class EnrollmentOut(ORMModel):
    id: str
    class_id: str
    student_id: str
    status: str
    created_at: datetime


class EnrollmentCreate(StrictModel):
    student_id: str


class AuditLogOut(ORMModel):
    id: str
    actor_user_id: str | None
    action: str
    entity_type: str
    entity_id: str | None
    before_json: dict[str, Any]
    after_json: dict[str, Any]
    reason: str | None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime


class DashboardOut(StrictModel):
    counts: dict[str, int]
    attendance: dict[str, float | int]
