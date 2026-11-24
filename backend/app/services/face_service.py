from __future__ import annotations

import base64
import binascii
import json
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, cast

import numpy as np
from sqlalchemy import delete, func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.core.config import Settings, settings
from app.core.errors import AppError
from app.core.security import decrypt_secret, encrypt_secret
from app.models import BiometricConsent, FaceEmbedding, Student
from app.utils.uuid import new_uuid, utcnow


@dataclass(frozen=True)
class FaceDetection:
    embedding: np.ndarray
    bbox: tuple[float, float, float, float]


@dataclass(frozen=True)
class FrameAnalysis:
    embedding: np.ndarray
    embeddings: list[np.ndarray]
    centers: list[tuple[float, float]]


_face_app: object | None = None
_face_app_error: str | None = None
_face_app_error_at: float | None = None
_FACE_MODEL_RETRY_SECONDS = 30.0


def _model_unavailable(detail: str) -> AppError:
    return AppError(
        503,
        "face_model_unavailable",
        "Face recognition model is unavailable",
        {"detail": detail, "model": settings.face_model_name},
    )


def get_face_app() -> Any:
    global _face_app, _face_app_error, _face_app_error_at
    if _face_app is not None:
        return _face_app
    now = utcnow().timestamp()
    if _face_app_error is not None and _face_app_error_at is not None:
        if now - _face_app_error_at < _FACE_MODEL_RETRY_SECONDS:
            raise _model_unavailable(_face_app_error)
        _face_app_error = None
        _face_app_error_at = None
    try:
        from insightface.app import FaceAnalysis

        app = FaceAnalysis(name=settings.face_model_name, providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1, det_size=(640, 640))
        _face_app = app
        _face_app_error = None
        _face_app_error_at = None
        return app
    except Exception as exc:
        _face_app_error = str(exc) or exc.__class__.__name__
        _face_app_error_at = now
        raise _model_unavailable(_face_app_error) from exc


def decode_frame(frame: str) -> Any:
    try:
        import cv2

        payload = frame.split(",", 1)[1] if frame.startswith("data:") and "," in frame else frame
        raw = base64.b64decode(payload, validate=True)
        if len(raw) > 10_000_000:
            raise AppError(422, "validation_error", "Face frame exceeds the maximum allowed size")
        array = np.frombuffer(raw, dtype=np.uint8)
        image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    except (binascii.Error, ValueError) as exc:
        raise AppError(422, "validation_error", "Face frame is not valid base64 image data") from exc
    if image is None:
        raise AppError(422, "validation_error", "Face frame could not be decoded as an image")
    return image


def detect_faces(image: object) -> list[FaceDetection]:
    app = get_face_app()
    detections = app.get(image)
    results: list[FaceDetection] = []
    for detection in detections:
        box = [float(value) for value in detection.bbox[:4]]
        bbox = (box[0], box[1], box[2], box[3])
        embedding = np.asarray(detection.embedding, dtype=np.float32)
        norm = float(np.linalg.norm(embedding))
        if norm == 0:
            continue
        results.append(FaceDetection(embedding=embedding / norm, bbox=bbox))
    return results


def _centers(detection: FaceDetection) -> tuple[float, float]:
    x1, y1, x2, y2 = detection.bbox
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _movement(centers: list[tuple[float, float]]) -> float:
    return max(
        (float(np.linalg.norm(np.asarray(a) - np.asarray(b))) for a in centers for b in centers),
        default=0.0,
    )


def analyze_frames(
    frames: list[str],
    config: Settings = settings,
) -> FrameAnalysis:
    minimum = config.face_liveness_min_frames
    if len(frames) < minimum:
        raise AppError(
            422,
            "face_verification_failed",
            f"At least {minimum} face frames are required",
            {"liveness": "insufficient_frames"},
        )

    detections_per_frame: list[list[FaceDetection]] = []
    for frame in frames:
        image = decode_frame(frame)
        detections = detect_faces(image)
        if len(detections) != 1:
            raise AppError(
                422,
                "face_verification_failed",
                "Each frame must contain exactly one face",
                {"liveness": "face_count", "faces_detected": len(detections)},
            )
        detections_per_frame.append(detections)

    centers = [_centers(frame_detections[0]) for frame_detections in detections_per_frame]
    movement = _movement(centers)
    if movement < config.face_liveness_movement:
        raise AppError(
            422,
            "face_verification_failed",
            "Liveness check failed: no face movement detected",
            {"liveness": "insufficient_movement", "movement": round(movement, 3)},
        )

    embeddings = [frame_detections[0].embedding for frame_detections in detections_per_frame]
    mean_embedding = np.mean(np.vstack(embeddings), axis=0)
    norm = float(np.linalg.norm(mean_embedding))
    if norm == 0:
        raise AppError(422, "face_verification_failed", "Face embedding could not be computed")
    return FrameAnalysis(embedding=mean_embedding / norm, embeddings=embeddings, centers=centers)


def cosine_similarity(left: np.ndarray | list[float], right: np.ndarray | list[float]) -> float:
    a = np.asarray(left, dtype=np.float32)
    b = np.asarray(right, dtype=np.float32)
    norm = float(np.linalg.norm(a) * np.linalg.norm(b))
    if norm == 0:
        return 0.0
    return float(np.dot(a, b) / norm)


def _stored_embedding(row: FaceEmbedding) -> np.ndarray:
    try:
        vector = json.loads(decrypt_secret(row.encrypted_embedding))
    except (ValueError, json.JSONDecodeError) as exc:
        raise AppError(500, "internal_error", "Stored biometric data is corrupt") from exc
    return np.asarray(vector, dtype=np.float32)


def register_embeddings(db: Session, student: Student, analysis: FrameAnalysis, config: Settings = settings) -> int:
    others = db.scalars(
        select(FaceEmbedding).where(FaceEmbedding.student_id != student.id, FaceEmbedding.is_active.is_(True))
    ).all()
    for row in others:
        score = cosine_similarity(analysis.embedding, _stored_embedding(row))
        if score >= config.face_match_threshold:
            raise AppError(
                409,
                "conflict",
                "Face matches an already registered student",
                {"code_detail": "duplicate_face", "similarity": round(score, 4)},
            )

    db.execute(delete(FaceEmbedding).where(FaceEmbedding.student_id == student.id))
    for embedding in analysis.embeddings:
        db.add(
            FaceEmbedding(
                id=new_uuid(),
                student_id=student.id,
                encrypted_embedding=encrypt_secret(json.dumps(embedding.tolist())),
                model_name=config.face_model_name,
                vector_version="1",
                is_active=True,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    db.flush()
    return len(analysis.embeddings)


def verify_student_face(
    db: Session,
    student: Student,
    analysis: FrameAnalysis,
    config: Settings = settings,
) -> float:
    rows = db.scalars(
        select(FaceEmbedding).where(FaceEmbedding.student_id == student.id, FaceEmbedding.is_active.is_(True))
    ).all()
    if not rows:
        raise AppError(
            403,
            "face_verification_failed",
            "No active face registration found for this student",
            {"code_detail": "not_registered"},
        )
    score = max(cosine_similarity(analysis.embedding, _stored_embedding(row)) for row in rows)
    if score < config.face_match_threshold:
        raise AppError(
            403,
            "face_verification_failed",
            "Face verification failed",
            {"similarity": round(score, 4), "threshold": config.face_match_threshold},
        )
    return score


def active_embedding_count(db: Session, student: Student) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(FaceEmbedding)
            .where(FaceEmbedding.student_id == student.id, FaceEmbedding.is_active.is_(True))
        )
        or 0
    )


def delete_biometrics(db: Session, student: Student) -> None:
    db.execute(delete(FaceEmbedding).where(FaceEmbedding.student_id == student.id))
    db.execute(delete(BiometricConsent).where(BiometricConsent.student_id == student.id))
    db.flush()


def set_consent(db: Session, student: Student, version: str) -> BiometricConsent:
    consent = db.scalar(select(BiometricConsent).where(BiometricConsent.student_id == student.id))
    now = utcnow()
    if consent is None:
        consent = BiometricConsent(
            id=new_uuid(),
            student_id=student.id,
            consent_version=version,
            consented_at=now,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(consent)
    else:
        consent.consent_version = version
        consent.consented_at = now
        consent.revoked_at = None
        consent.is_active = True
        consent.updated_at = now
    db.flush()
    return consent


def purge_expired_embeddings(db: Session, retention_days: int, config: Settings = settings) -> int:
    cutoff = utcnow() - timedelta(days=retention_days)
    result = cast(
        CursorResult[Any],
        db.execute(delete(FaceEmbedding).where(FaceEmbedding.created_at < cutoff)),
    )
    remaining = select(FaceEmbedding.student_id).where(FaceEmbedding.student_id == BiometricConsent.student_id)
    db.execute(
        update(BiometricConsent)
        .where(BiometricConsent.is_active.is_(True), ~remaining.exists())
        .values(is_active=False, revoked_at=utcnow(), updated_at=utcnow())
    )
    db.flush()
    return int(result.rowcount or 0)
