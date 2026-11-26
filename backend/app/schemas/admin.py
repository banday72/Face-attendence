from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import EmailStr, Field, field_validator, model_validator

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


class SemesterCreate(StrictModel):
    name: str = Field(min_length=2, max_length=150)
    code: str = Field(min_length=2, max_length=20)
    number: int | None = Field(default=None, ge=1, le=8)
    academic_year: str = Field(min_length=4, max_length=20)
    session: str | None = Field(default=None, max_length=100)
    department_id: str | None = None
    program: str | None = Field(default=None, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    registration_start: date | None = None
    registration_end: date | None = None
    exam_start: date | None = None
    exam_end: date | None = None
    is_active: bool = False

    @field_validator("name", "code", "academic_year")
    @classmethod
    def strip_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field is required")
        return cleaned

    @model_validator(mode="after")
    def validate_date_range(self) -> SemesterCreate:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.registration_start and self.registration_end and self.registration_end < self.registration_start:
            raise ValueError("registration_end must be on or after registration_start")
        if self.exam_start and self.exam_end and self.exam_end < self.exam_start:
            raise ValueError("exam_end must be on or after exam_start")
        return self


class SemesterUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    code: str | None = Field(default=None, min_length=2, max_length=20)
    number: int | None = Field(default=None, ge=1, le=8)
    academic_year: str | None = Field(default=None, min_length=4, max_length=20)
    session: str | None = Field(default=None, max_length=100)
    department_id: str | None = None
    program: str | None = Field(default=None, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    registration_start: date | None = None
    registration_end: date | None = None
    exam_start: date | None = None
    exam_end: date | None = None
    is_active: bool | None = None

    @field_validator("name", "code", "academic_year")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field cannot be blank")
        return cleaned

    @model_validator(mode="after")
    def validate_date_range(self) -> SemesterUpdate:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.registration_start and self.registration_end and self.registration_end < self.registration_start:
            raise ValueError("registration_end must be on or after registration_start")
        if self.exam_start and self.exam_end and self.exam_end < self.exam_start:
            raise ValueError("exam_end must be on or after exam_start")
        return self


class SemesterOut(ORMModel):
    id: str
    name: str
    code: str
    number: int | None = None
    academic_year: str
    session: str | None = None
    department_id: str | None = None
    department_name: str | None = None
    program: str | None = None
    start_date: date | None
    end_date: date | None
    registration_start: date | None = None
    registration_end: date | None = None
    exam_start: date | None = None
    exam_end: date | None = None
    is_active: bool
    class_count: int = 0
    is_current: bool = False
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
    university_id: str | None = Field(default=None, max_length=50)
    employee_id: str | None = Field(default=None, max_length=50)
    program: str | None = Field(default=None, max_length=120)
    year_level: int | None = Field(default=None, ge=1, le=8)
    title: str | None = Field(default=None, max_length=50)
    office: str | None = Field(default=None, max_length=80)

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_password(value)


class PasswordResetIn(StrictModel):
    password: str

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password(value)


class BulkImportError(StrictModel):
    row: int
    email: str
    error: str


class BulkImportResult(StrictModel):
    total: int
    created: int
    failed: int
    errors: list[BulkImportError]


class UserAdminOut(UserOut):
    department_id: str | None = None
    department_name: str | None = None
    university_id: str | None = None
    employee_id: str | None = None
    program: str | None = None
    year_level: int | None = None
    title: str | None = None
    office: str | None = None


class FacultyOut(ORMModel):
    id: str
    user_id: str
    email: str
    full_name: str
    employee_id: str
    department_id: str | None = None
    department_name: str | None = None
    title: str | None = None
    office: str | None = None
    is_active: bool
    course_count: int = 0
    class_count: int = 0
    created_at: datetime


class CourseCreate(StrictModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=150)
    credits: int = Field(default=3, ge=1, le=12)
    department_id: str
    course_type: Literal["theoretical", "practical", "laboratory"] = "theoretical"
    description: str | None = Field(default=None, max_length=500)


class CourseUpdate(StrictModel):
    code: str | None = Field(default=None, min_length=2, max_length=30)
    name: str | None = Field(default=None, min_length=2, max_length=150)
    credits: int | None = Field(default=None, ge=1, le=12)
    department_id: str | None = None
    course_type: Literal["theoretical", "practical", "laboratory"] | None = None
    description: str | None = Field(default=None, max_length=500)


class CourseOut(ORMModel):
    id: str
    code: str
    name: str
    credits: int
    course_type: str = "theoretical"
    department_id: str
    department_name: str | None = None
    description: str | None
    created_at: datetime


class ClassCreate(StrictModel):
    course_id: str
    professor_id: str | None = None
    department_id: str | None = None
    semester_id: str | None = None
    section: str = Field(min_length=1, max_length=30)
    term: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, max_length=150)
    capacity: int = Field(default=60, ge=1, le=500)
    is_active: bool = True

    @model_validator(mode="after")
    def require_term_or_semester(self) -> ClassCreate:
        if not self.term and not self.semester_id:
            raise ValueError("term or semester_id is required")
        return self


class ClassUpdate(StrictModel):
    course_id: str | None = None
    professor_id: str | None = None
    department_id: str | None = None
    semester_id: str | None = None
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
    semester_id: str | None = None
    section: str
    term: str
    semester: str | None = None
    academic_year: str | None = None
    name: str | None
    capacity: int
    is_active: bool
    created_at: datetime
    course_name: str | None = None
    professor_name: str | None = None
    classroom_id: str | None = None
    classroom_name: str | None = None
    schedule_days: list[str] = Field(default_factory=list)
    start_time: time | None = None
    end_time: time | None = None
    enrolled_count: int = 0


class EnrollmentOut(ORMModel):
    id: str
    class_id: str
    student_id: str
    status: str
    created_at: datetime


class EnrollmentCreate(StrictModel):
    student_id: str


class ProfessorOptionOut(ORMModel):
    id: str
    user_id: str
    email: str
    full_name: str
    employee_id: str
    department_id: str | None = None
    department_name: str | None = None
    title: str | None = None
    is_active: bool


class StudentOptionOut(ORMModel):
    id: str
    user_id: str
    email: str
    full_name: str
    university_id: str
    department_id: str | None = None
    department_name: str | None = None
    program: str | None = None
    year_level: int | None = None
    is_active: bool


class CourseProfessorOut(ORMModel):
    id: str
    course_id: str
    professor_id: str
    full_name: str
    email: str
    employee_id: str
    department_name: str | None = None
    assigned_at: datetime


class ClassProfessorOut(ORMModel):
    id: str
    class_id: str
    class_name: str | None
    course_id: str
    course_name: str | None
    semester_id: str | None
    semester: str | None
    academic_year: str | None
    professor_id: str
    full_name: str
    email: str
    employee_id: str
    department_name: str | None = None
    assigned_at: datetime


class ScheduleCreate(StrictModel):
    class_id: str
    classroom_id: str | None = None
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    department_id: str | None = None
    semester_id: str | None = None
    course_id: str | None = None
    professor_id: str | None = None
    class_type: Literal["Lecture", "Lab", "Practical", "Tutorial"] = "Lecture"
    notes: str | None = Field(default=None, max_length=1000)
    recurrence_type: Literal["one_time", "daily", "weekly", "monthly", "custom", "semester"] = "weekly"
    start_date: date | None = None
    end_date: date | None = None
    repeat_days: list[int] = Field(default_factory=list)
    custom_dates: list[date] = Field(default_factory=list)
    holiday_dates: list[date] = Field(default_factory=list)
    exclude_holidays: bool = False
    monthly_mode: Literal["date", "weekday"] = "date"

    @model_validator(mode="after")
    def validate_time_range(self) -> ScheduleCreate:
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time")
        return self


class ScheduleUpdate(StrictModel):
    class_id: str | None = None
    classroom_id: str | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None
    department_id: str | None = None
    semester_id: str | None = None
    course_id: str | None = None
    professor_id: str | None = None
    class_type: Literal["Lecture", "Lab", "Practical", "Tutorial"] | None = None
    notes: str | None = Field(default=None, max_length=1000)
    recurrence_type: Literal["one_time", "daily", "weekly", "monthly", "custom", "semester"] | None = None
    start_date: date | None = None
    end_date: date | None = None
    repeat_days: list[int] | None = None
    custom_dates: list[date] | None = None
    holiday_dates: list[date] | None = None
    exclude_holidays: bool | None = None
    monthly_mode: Literal["date", "weekday"] | None = None


class ScheduleOut(ORMModel):
    id: str
    class_id: str
    class_name: str | None = None
    course_id: str | None = None
    course_name: str | None = None
    professor_id: str | None = None
    professor_name: str | None = None
    classroom_id: str | None = None
    classroom_name: str | None = None
    department_id: str | None = None
    department_name: str | None = None
    semester_id: str | None = None
    semester_name: str | None = None
    schedule_group_id: str | None = None
    class_type: str = "Lecture"
    notes: str | None = None
    recurrence_type: str = "weekly"
    start_date: date | None = None
    end_date: date | None = None
    repeat_days: list[int] = Field(default_factory=list)
    custom_dates: list[date] = Field(default_factory=list)
    holiday_dates: list[date] = Field(default_factory=list)
    exclude_holidays: bool = False
    monthly_mode: str | None = None
    day_of_week: int
    start_time: time
    end_time: time
    created_at: datetime


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
    scheduling: dict[str, int] = Field(default_factory=dict)


class AlertOut(StrictModel):
    id: str
    title: str
    description: str
    severity: Literal["warning", "danger", "info"]
    href: str | None = None
    created_at: datetime | None = None


class AlertsOut(StrictModel):
    items: list[AlertOut]
