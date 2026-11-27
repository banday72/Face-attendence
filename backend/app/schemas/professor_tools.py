from __future__ import annotations

from app.schemas.common import StrictModel


class MissingStudentOut(StrictModel):
    student_id: str
    university_id: str
    student_name: str
    enrollment_status: str


class MarkAbsentResult(StrictModel):
    session_id: str
    marked_count: int
    marked_student_ids: list[str]


class ClassRiskOut(StrictModel):
    class_id: str
    course_code: str
    course_name: str
    section: str
    enrolled_count: int
    total_sessions: int
    present: int
    late: int
    absent: int
    attendance_rate: float
    at_risk_count: int
