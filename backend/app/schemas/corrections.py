from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.attendance import AttendanceMethod, AttendanceStatus
from app.schemas.common import ORMModel, Page, StrictModel

CorrectionStatus = Literal["pending", "approved", "rejected"]
ReviewDecision = Literal["approved", "rejected"]


class CorrectionRequestCreate(StrictModel):
    session_id: str
    record_id: str | None = None
    requested_status: AttendanceStatus
    reason: str = Field(min_length=10, max_length=500)


class CorrectionReviewIn(StrictModel):
    decision: ReviewDecision
    final_status: AttendanceStatus | None = None
    final_method: AttendanceMethod | None = None
    review_note: str | None = None

    @model_validator(mode="after")
    def review_note_required(self) -> CorrectionReviewIn:
        if self.decision == "rejected" and not self.review_note:
            raise ValueError("review_note is required when rejecting a request")
        return self


class CorrectionRequestOut(ORMModel):
    id: str
    session_id: str
    record_id: str | None
    requested_status: AttendanceStatus
    reason: str
    review_note: str | None
    status: CorrectionStatus
    reviewed_at: datetime | None
    created_at: datetime
    student_name: str
    university_id: str
    course_code: str
    class_section: str
    session_start: datetime
    reviewer_name: str | None


CorrectionRequestPage = Page[CorrectionRequestOut]
