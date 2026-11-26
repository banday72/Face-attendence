from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, field_validator, model_validator
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    request_validation_handler,
    unhandled_exception_handler,
)
from app.schemas.face import (
    MAX_FRAMES,
    MIN_FRAMES,
    validate_centers,
    validate_descriptors,
)
from app.services import face_service

app = FastAPI(title="Face Descriptor Helper", docs_url=None, redoc_url=None)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, request_validation_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


class AnalyzeRequest(BaseModel):
    descriptors: list[list[float]] = Field(min_length=MIN_FRAMES, max_length=MAX_FRAMES)
    centers: list[list[float]] = Field(min_length=MIN_FRAMES, max_length=MAX_FRAMES)
    min_frames: int | None = Field(default=None, ge=1)
    min_movement: float | None = Field(default=None, gt=0)

    @field_validator("descriptors")
    @classmethod
    def descriptors_valid(cls, value: list[list[float]]) -> list[list[float]]:
        return validate_descriptors(value)

    @field_validator("centers")
    @classmethod
    def centers_valid(cls, value: list[list[float]]) -> list[list[float]]:
        return validate_centers(value)

    @model_validator(mode="after")
    def matching_counts(self) -> AnalyzeRequest:
        if len(self.descriptors) != len(self.centers):
            raise ValueError("descriptor and center counts must match")
        return self


class AnalyzeResponse(BaseModel):
    embedding: list[float]
    embeddings: list[list[float]]
    centers: list[list[float]]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.face_model_name}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    updates: dict[str, object] = {}
    if payload.min_frames is not None:
        updates["face_liveness_min_frames"] = payload.min_frames
    if payload.min_movement is not None:
        updates["face_liveness_movement"] = payload.min_movement
    config = settings.model_copy(update=updates)
    analysis = face_service.analyze_client_frames(payload.descriptors, payload.centers, config)
    return AnalyzeResponse(
        embedding=analysis.embedding,
        embeddings=analysis.embeddings,
        centers=[[center[0], center[1]] for center in analysis.centers],
    )
