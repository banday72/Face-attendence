from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    request_validation_handler,
    unhandled_exception_handler,
)
from app.services import face_service

app = FastAPI(title="Face Analysis Worker", docs_url=None, redoc_url=None)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, request_validation_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


class AnalyzeRequest(BaseModel):
    frames: list[str] = Field(min_length=1, max_length=10)
    min_frames: int | None = Field(default=None, ge=1)
    min_movement: float | None = Field(default=None, gt=0)


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
    analysis = face_service._analyze_frames_local(payload.frames, config)
    return AnalyzeResponse(
        embedding=[float(value) for value in analysis.embedding.tolist()],
        embeddings=[[float(value) for value in item.tolist()] for item in analysis.embeddings],
        centers=[[float(center[0]), float(center[1])] for center in analysis.centers],
    )
