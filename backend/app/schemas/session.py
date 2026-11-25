from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import StrictModel

SessionStatus = Literal["scheduled", "active", "closed", "cancelled"]
ChallengeType = Literal["turn_left", "turn_right", "blink"]


class SessionCreate(StrictModel):
    class_id: str
    classroom_id: str | None = None
    starts_at: datetime
    ends_at: datetime
    require_face: bool = False
    require_location: bool = True
    late_minutes: int | None = Field(default=None, ge=0, le=240)
    qr_validity_seconds: int | None = Field(default=None, ge=300, le=3600)
    qr_refresh_seconds: int | None = Field(default=None, ge=1, le=3600)
    challenge: ChallengeType | None = None
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_policy(self) -> SessionCreate:
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if self.require_location and not self.classroom_id:
            raise ValueError("classroom_id is required when location verification is enabled")
        if self.require_face and not self.challenge:
            raise ValueError("challenge is required when face verification is enabled")
        return self


class SessionOut(StrictModel):
    id: str
    class_id: str
    classroom_id: str | None
    course_code: str | None = None
    course_name: str | None = None
    section: str | None = None
    term: str | None = None
    professor_id: str | None
    starts_at: datetime
    ends_at: datetime
    status: SessionStatus
    require_face: bool
    require_location: bool
    late_minutes: int
    qr_validity_seconds: int
    qr_refresh_seconds: int
    challenge: str | None
    qr_generation: int
    total_enrolled: int = 0
    present_count: int = 0
    late_count: int = 0
    absent_count: int = 0
    created_at: datetime


class QRPayloadOut(StrictModel):
    qr_payload: str
    expires_at: datetime
    generation: int
    refresh_after_seconds: int


class StartSessionOut(StrictModel):
    session: SessionOut
    qr: QRPayloadOut


class ActiveSessionOut(StrictModel):
    id: str
    class_id: str
    course_code: str | None = None
    course_name: str | None = None
    section: str | None = None
    starts_at: datetime
    ends_at: datetime
    require_face: bool
    require_location: bool
    challenge: str | None
    classroom_id: str | None
    classroom_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
