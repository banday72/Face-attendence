from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator

from app.schemas.attendance import AttendanceMethod, AttendanceStatus
from app.schemas.common import ORMModel, StrictModel

ReportPeriod = Literal["daily", "weekly", "monthly", "course", "student", "professor", "department"]
ReportFormat = Literal["xlsx", "pdf"]
ReportFrequency = Literal["daily", "weekly", "monthly"]


class ReportSummaryOut(StrictModel):
    period: ReportPeriod
    total_records: int
    attendance_rate: float
    by_status: dict[str, int]
    groups: list[dict[str, object]]


class ReportRecordOut(StrictModel):
    id: str
    student_name: str
    university_id: str
    course_code: str
    course_name: str
    class_section: str
    professor_name: str | None
    classroom_name: str | None
    session_start: datetime
    status: AttendanceStatus
    method: AttendanceMethod
    marked_at: datetime
    location_status: str
    face_status: str
    is_manual: bool
    correction_reason: str | None = None


class ReportExportOut(StrictModel):
    filename: str
    content_type: str
    size_bytes: int


class ReportFilterIn(StrictModel):
    from_date: str | None = None
    to_date: str | None = None
    course_id: str | None = None
    class_id: str | None = None
    professor_id: str | None = None
    department_id: str | None = None
    status: AttendanceStatus | None = None
    method: AttendanceMethod | None = None
    group_by: str | None = Field(default=None, max_length=30)
    period: ReportPeriod | None = None

    @field_validator("from_date", "to_date")
    @classmethod
    def valid_date(cls, value: str | None) -> str | None:
        if not value:
            return None
        try:
            datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("must be a valid ISO date or datetime") from exc
        return value


class ReportPresetIn(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    report_type: str = Field(default="records", min_length=1, max_length=30)
    filters: ReportFilterIn = Field(default_factory=ReportFilterIn)
    is_default: bool = False


class ReportPresetUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    report_type: str | None = Field(default=None, min_length=1, max_length=30)
    filters: ReportFilterIn | None = None
    is_default: bool | None = None


class ReportPresetOut(ORMModel):
    id: str
    user_id: str
    name: str
    report_type: str
    filters: dict[str, Any]
    is_default: bool
    created_at: datetime
    updated_at: datetime


class ScheduledExportIn(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    format: ReportFormat = "xlsx"
    frequency: ReportFrequency = "weekly"
    filters: ReportFilterIn = Field(default_factory=ReportFilterIn)
    is_active: bool = True


class ScheduledExportUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    format: ReportFormat | None = None
    frequency: ReportFrequency | None = None
    filters: ReportFilterIn | None = None
    is_active: bool | None = None


class ScheduledExportOut(ORMModel):
    id: str
    user_id: str
    name: str
    format: ReportFormat
    frequency: ReportFrequency
    filters: dict[str, Any]
    next_run_at: datetime
    last_run_at: datetime | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ScheduledExportRunOut(ORMModel):
    id: str
    schedule_id: str
    user_id: str
    filename: str
    content_type: str
    size_bytes: int
    status: str
    error: str | None
    created_at: datetime
    updated_at: datetime
