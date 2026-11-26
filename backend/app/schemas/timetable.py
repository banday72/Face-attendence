from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.admin import ClassOut, FacultyOut, ScheduleOut, SemesterOut
from app.schemas.common import ORMModel, StrictModel

DateValue = date

RecurrenceType = Literal["one_time", "daily", "weekly", "monthly", "custom", "semester"]
ClassType = Literal["Lecture", "Lab", "Practical", "Tutorial"]
CourseType = Literal["theoretical", "practical", "laboratory"]
MonthlyMode = Literal["date", "weekday"]
ConflictType = Literal["teacher", "classroom", "student_group", "semester_range", "capacity"]


class TimetableScheduleCreate(StrictModel):
    class_id: str | None = None
    department_id: str | None = None
    semester_id: str | None = None
    course_id: str | None = None
    professor_id: str | None = None
    classroom_id: str | None = None
    section: str | None = Field(default=None, max_length=30)
    days_of_week: list[int] = Field(default_factory=list)
    start_time: time
    end_time: time
    class_type: ClassType = "Lecture"
    notes: str | None = Field(default=None, max_length=1000)
    recurrence_type: RecurrenceType = "weekly"
    start_date: date | None = None
    end_date: date | None = None
    custom_dates: list[date] = Field(default_factory=list)
    holiday_dates: list[date] = Field(default_factory=list)
    exclude_holidays: bool = False
    monthly_mode: MonthlyMode = "date"

    @field_validator("days_of_week")
    @classmethod
    def validate_days(cls, value: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("days_of_week values must be between 0 (Monday) and 6 (Sunday)")
        return sorted(set(value))

    @model_validator(mode="after")
    def validate_schedule(self) -> TimetableScheduleCreate:
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time")
        if self.recurrence_type in {"weekly", "semester"} and not self.days_of_week:
            raise ValueError("Select at least one day of the week for this recurrence")
        if self.recurrence_type in {"one_time", "daily", "monthly", "semester"} and self.start_date is None:
            raise ValueError("start_date is required for this recurrence")
        if self.recurrence_type == "custom" and not self.custom_dates:
            raise ValueError("Select at least one date for a custom schedule")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if not self.class_id and not self.course_id:
            raise ValueError("Choose a class or a subject")
        return self


class TimetableScheduleUpdate(StrictModel):
    department_id: str | None = None
    semester_id: str | None = None
    course_id: str | None = None
    professor_id: str | None = None
    classroom_id: str | None = None
    days_of_week: list[int] | None = None
    start_time: time | None = None
    end_time: time | None = None
    class_type: ClassType | None = None
    notes: str | None = Field(default=None, max_length=1000)
    recurrence_type: RecurrenceType | None = None
    start_date: date | None = None
    end_date: date | None = None
    custom_dates: list[date] | None = None
    holiday_dates: list[date] | None = None
    exclude_holidays: bool | None = None
    monthly_mode: MonthlyMode | None = None

    @field_validator("days_of_week")
    @classmethod
    def validate_days(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("days_of_week values must be between 0 (Monday) and 6 (Sunday)")
        return sorted(set(value))

    @model_validator(mode="after")
    def validate_schedule(self) -> TimetableScheduleUpdate:
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.recurrence_type in {"weekly", "semester"} and self.days_of_week is not None and not self.days_of_week:
            raise ValueError("Select at least one day of the week for this recurrence")
        return self


class ScheduleGroupOut(ORMModel):
    group_id: str
    items: list[ScheduleOut]
    occurrences: int


class TimetableEntryOut(ORMModel):
    id: str
    schedule_id: str
    group_id: str | None = None
    date: DateValue
    day_of_week: int
    start_time: time
    end_time: time
    class_id: str
    class_name: str | None = None
    course_id: str | None = None
    course_name: str | None = None
    course_code: str | None = None
    professor_id: str | None = None
    professor_name: str | None = None
    classroom_id: str | None = None
    classroom_name: str | None = None
    department_id: str | None = None
    department_name: str | None = None
    semester_id: str | None = None
    semester_name: str | None = None
    class_type: str
    notes: str | None = None
    recurrence_type: str


class ConflictOut(ORMModel):
    type: ConflictType
    severity: Literal["error", "warning"] = "error"
    message: str
    date: DateValue | None = None
    schedule_id: str | None = None
    other_schedule_id: str | None = None


class ConflictCheckOut(ORMModel):
    valid: bool
    conflicts: list[ConflictOut]
    occurrence_count: int


class TimetableSummaryOut(ORMModel):
    total_schedules: int
    classes_today: int
    upcoming_classes: int
    conflicts: int
    by_type: dict[str, int]


class HolidayCreate(StrictModel):
    name: str = Field(min_length=2, max_length=150)
    holiday_date: date
    holiday_type: str = Field(default="Holiday", max_length=30)
    description: str | None = Field(default=None, max_length=500)


class HolidayUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    holiday_date: date | None = None
    holiday_type: str | None = Field(default=None, max_length=30)
    description: str | None = Field(default=None, max_length=500)


class HolidayOut(ORMModel):
    id: str
    name: str
    holiday_date: date
    holiday_type: str
    description: str | None
    created_at: datetime


class ClassroomCreate(StrictModel):
    name: str = Field(min_length=2, max_length=100)
    building: str | None = Field(default=None, max_length=100)
    room: str | None = Field(default=None, max_length=30)
    room_type: str = Field(default="Classroom", max_length=30)
    capacity: int | None = Field(default=None, ge=1, le=1000)
    latitude: float = 0.0
    longitude: float = 0.0
    radius_override_meters: float | None = Field(default=None, ge=1, le=10000)
    is_active: bool = True


class ClassroomUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    building: str | None = Field(default=None, max_length=100)
    room: str | None = Field(default=None, max_length=30)
    room_type: str | None = Field(default=None, max_length=30)
    capacity: int | None = Field(default=None, ge=1, le=1000)
    latitude: float | None = None
    longitude: float | None = None
    radius_override_meters: float | None = Field(default=None, ge=1, le=10000)
    is_active: bool | None = None


class ClassroomOut(ORMModel):
    id: str
    name: str
    building: str | None = None
    room: str | None = None
    room_type: str
    capacity: int | None = None
    latitude: float
    longitude: float
    radius_override_meters: float | None = None
    is_active: bool
    scheduled_classes: int = 0
    created_at: datetime


class SubjectCreate(StrictModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=150)
    credits: int = Field(default=3, ge=1, le=12)
    department_id: str
    course_type: CourseType = "theoretical"
    description: str | None = Field(default=None, max_length=500)
    semester_ids: list[str] = Field(default_factory=list)
    eligible_professor_ids: list[str] = Field(default_factory=list)


class SubjectUpdate(StrictModel):
    code: str | None = Field(default=None, min_length=2, max_length=30)
    name: str | None = Field(default=None, min_length=2, max_length=150)
    credits: int | None = Field(default=None, ge=1, le=12)
    department_id: str | None = None
    course_type: CourseType | None = None
    description: str | None = Field(default=None, max_length=500)
    semester_ids: list[str] | None = None
    eligible_professor_ids: list[str] | None = None


class SubjectOut(ORMModel):
    id: str
    code: str
    name: str
    credits: int
    course_type: str
    department_id: str
    department_name: str | None = None
    description: str | None = None
    semester_ids: list[str] = Field(default_factory=list)
    eligible_professor_ids: list[str] = Field(default_factory=list)
    created_at: datetime


class DepartmentDetailOut(ORMModel):
    id: str
    name: str
    code: str
    description: str | None = None
    teachers: list[FacultyOut] = Field(default_factory=list)
    subjects: list[SubjectOut] = Field(default_factory=list)
    classes: list[ClassOut] = Field(default_factory=list)
    semesters: list[SemesterOut] = Field(default_factory=list)
    created_at: datetime


class FacultyUpdate(StrictModel):
    department_id: str | None = None
    title: str | None = Field(default=None, max_length=50)
    office: str | None = Field(default=None, max_length=80)
    is_active: bool | None = None


class SemesterAssignmentIn(StrictModel):
    semester_ids: list[str] = Field(default_factory=list)


class ProfessorAssignmentIn(StrictModel):
    professor_ids: list[str] = Field(default_factory=list)
