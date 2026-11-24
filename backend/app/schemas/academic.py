from __future__ import annotations

from datetime import datetime, time

from app.schemas.common import ORMModel


class DepartmentOption(ORMModel):
    id: str
    name: str
    code: str


class CourseOption(ORMModel):
    id: str
    code: str
    name: str
    department_id: str


class ClassroomOption(ORMModel):
    id: str
    name: str
    building: str | None
    room: str | None
    latitude: float
    longitude: float
    radius_override_meters: float | None
    is_active: bool


class ScheduleOut(ORMModel):
    id: str
    class_id: str
    classroom_id: str | None
    day_of_week: int
    start_time: time
    end_time: time
    created_at: datetime


class StudentScheduleItem(ORMModel):
    id: str
    class_id: str
    class_name: str | None
    course_id: str
    course_name: str
    professor_name: str | None
    classroom_id: str | None
    classroom_name: str | None
    day_of_week: int
    day_name: str
    start_time: time
    end_time: time
