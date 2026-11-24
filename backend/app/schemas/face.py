from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import StrictModel


class FaceRegisterIn(StrictModel):
    consent_version: str = Field(min_length=1, max_length=20)
    frames: list[str] = Field(min_length=3, max_length=10)

    @field_validator("frames")
    @classmethod
    def validate_frames(cls, value: list[str]) -> list[str]:
        for frame in value:
            if not frame.startswith("data:image/"):
                raise ValueError("frames must be base64 data URIs")
            if len(frame) > 12_000_000:
                raise ValueError("frame is too large")
        return value


class FaceStatusOut(StrictModel):
    is_registered: bool
    embedding_count: int
    model_name: str
    consent_version: str | None
    consented_at: datetime | None
    requires_new_consent: bool
    liveness_min_frames: int


class FaceRegisterOut(StrictModel):
    embedding_count: int
    model_name: str
    consent_version: str
    similarity_threshold: float
