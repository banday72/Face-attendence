from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import ORMModel, StrictModel

AttendanceStatus = Literal["present", "late", "absent", "excused"]
AttendanceMethod = Literal["qr", "face", "manual", "system"]
LocationStatus = Literal["verified", "out_of_range", "unavailable", "not_required"]
FaceStatus = Literal["verified", "failed", "not_required"]


class QRCheckInIn(StrictModel):
    token: str = Field(pattern=r"^uat:v1:[A-Za-z0-9_-]+$")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float = Field(ge=0)


class FaceCheckInIn(StrictModel):
    session_id: str
    frames: list[str] = Field(min_length=1, max_length=10)
    challenge: str = Field(min_length=1, max_length=40)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)

    @field_validator("frames")
    @classmethod
    def validate_frames(cls, value: list[str]) -> list[str]:
        for frame in value:
            if not frame.startswith("data:image/"):
                raise ValueError("frames must be base64 data URIs")
            if len(frame) > 12_000_000:
                raise ValueError("frame is too large")
        return value


class AttendanceRecordOut(ORMModel):
    id: str
    session_id: str
    student_id: str
    student_name: str | None = None
    university_id: str | None = None
    status: AttendanceStatus
    method: AttendanceMethod
    marked_at: datetime
    latitude: float | None
    longitude: float | None
    accuracy: float | None
    face_score: float | None
    location_status: LocationStatus
    face_status: FaceStatus
    challenge: str | None
    is_manual: bool
    correction_reason: str | None


class ManualCorrectionIn(StrictModel):
    status: AttendanceStatus
    method: AttendanceMethod
    reason: str = Field(min_length=3, max_length=500)


class CoursePercentage(StrictModel):
    course_id: str
    course_code: str
    course_name: str
    total_sessions: int
    attended: int
    percentage: float


class StudentAttendanceHistory(ORMModel):
    items: list[AttendanceRecordOut]
    total: int
    page: int
    page_size: int
    pages: int
    course_percentages: list[CoursePercentage]


class RosterEntry(StrictModel):
    student_id: str
    university_id: str
    student_name: str
    enrollment_status: str
    record: AttendanceRecordOut | None


class ClassAttendanceOut(StrictModel):
    class_id: str
    course_code: str
    course_name: str
    section: str
    total_students: int
    present: int
    late: int
    absent: int
    attendance_percentage: float
    roster: list[RosterEntry]


class DashboardStat(StrictModel):
    label: str
    value: int | float


class StudentDashboardOut(StrictModel):
    percentages: list[CoursePercentage]
    warnings: list[str]
    recent_activity: list[AttendanceRecordOut]
    totals: dict[str, int | float]


class ProfessorDashboardOut(StrictModel):
    counts: dict[str, int]
    attendance: dict[str, float | int]
    recent_sessions: list[dict[str, object]]
