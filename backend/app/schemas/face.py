from __future__ import annotations

import math
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import StrictModel

DESCRIPTOR_SIZE = 128
MAX_FRAMES = 10
MIN_FRAMES = 3


def validate_descriptors(value: list[list[float]]) -> list[list[float]]:
    for descriptor in value:
        if len(descriptor) != DESCRIPTOR_SIZE:
            raise ValueError(f"each descriptor must contain exactly {DESCRIPTOR_SIZE} values")
        if not all(math.isfinite(item) for item in descriptor):
            raise ValueError("descriptor values must be finite numbers")
    return value


def validate_centers(value: list[list[float]]) -> list[list[float]]:
    for center in value:
        if len(center) != 2:
            raise ValueError("each center must contain exactly two values")
        if not all(math.isfinite(item) for item in center):
            raise ValueError("center values must be finite numbers")
    return value


class FaceRegisterIn(StrictModel):
    consent_version: str = Field(min_length=1, max_length=20)
    descriptors: list[list[float]] = Field(min_length=MIN_FRAMES, max_length=MAX_FRAMES)
    centers: list[list[float]] = Field(min_length=MIN_FRAMES, max_length=MAX_FRAMES)

    @field_validator("descriptors")
    @classmethod
    def descriptors_valid(cls, value: list[list[float]]) -> list[list[float]]:
        return validate_descriptors(value)

    @field_validator("centers")
    @classmethod
    def centers_valid(cls, value: list[list[float]]) -> list[list[float]]:
        return validate_centers(value)

    @model_validator(mode="after")
    def matching_counts(self) -> FaceRegisterIn:
        if len(self.descriptors) != len(self.centers):
            raise ValueError("descriptor and center counts must match")
        return self


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


class AdminFaceRegisterIn(FaceRegisterIn):
    consent_confirmed: Literal[True]
    consent_reference: str = Field(min_length=1, max_length=100)
