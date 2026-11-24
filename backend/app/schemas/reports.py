from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.attendance import AttendanceMethod, AttendanceStatus
from app.schemas.common import StrictModel

ReportPeriod = Literal["daily", "weekly", "monthly", "course", "student", "professor", "department"]


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


class ReportExportOut(StrictModel):
    filename: str
    content_type: str
    size_bytes: int
