from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING, Any, cast

from sqlalchemy import delete, func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from collections.abc import Sequence

from app.core.config import Settings, settings
from app.core.errors import AppError
from app.core.security import decrypt_secret, encrypt_secret
from app.models import BiometricConsent, FaceEmbedding, Student
from app.utils.uuid import new_uuid, utcnow

DESCRIPTOR_SIZE = 128
VECTOR_VERSION = "2"


@dataclass(frozen=True)
class FrameAnalysis:
    embedding: list[float]
    embeddings: list[list[float]]
    centers: list[tuple[float, float]]


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _normalize_vector(vector: Sequence[float]) -> list[float]:
    if len(vector) != DESCRIPTOR_SIZE or not all(_is_finite_number(value) for value in vector):
        raise AppError(
            422,
            "validation_error",
            f"Each face frame must contain {DESCRIPTOR_SIZE} finite descriptor values",
        )
    values = [float(value) for value in vector]
    norm = math.sqrt(sum(value * value for value in values))
    if norm == 0:
        raise AppError(
            422,
            "face_verification_failed",
            "Face descriptor is empty",
            {"liveness": "invalid_descriptor"},
        )
    return [value / norm for value in values]


def analyze_client_frames(
    descriptors: list[list[float]],
    centers: list[list[float]],
    config: Settings = settings,
) -> FrameAnalysis:
    if len(descriptors) != len(centers):
        raise AppError(422, "validation_error", "Descriptor and center counts must match")
    minimum = config.face_liveness_min_frames
    if len(descriptors) < minimum:
        raise AppError(
            422,
            "face_verification_failed",
            f"At least {minimum} face frames are required",
            {"liveness": "insufficient_frames"},
        )

    embeddings = [_normalize_vector(vector) for vector in descriptors]
    validated_centers: list[tuple[float, float]] = []
    for center in centers:
        if len(center) != 2 or not all(_is_finite_number(value) for value in center):
            raise AppError(422, "validation_error", "Each face frame must include a valid center point")
        validated_centers.append((float(center[0]), float(center[1])))

    movement = max(
        (math.dist(first, second) for first in validated_centers for second in validated_centers),
        default=0.0,
    )
    if movement < config.face_liveness_movement:
        raise AppError(
            422,
            "face_verification_failed",
            "Liveness check failed: no face movement detected",
            {"liveness": "insufficient_movement", "movement": round(movement, 3)},
        )

    mean_embedding = [sum(values) / len(embeddings) for values in zip(*embeddings)]
    norm = math.sqrt(sum(value * value for value in mean_embedding))
    if norm == 0:
        raise AppError(422, "face_verification_failed", "Face embedding could not be computed")
    return FrameAnalysis(
        embedding=[value / norm for value in mean_embedding],
        embeddings=embeddings,
        centers=validated_centers,
    )


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    if not all(_is_finite_number(value) for value in left) or not all(
        _is_finite_number(value) for value in right
    ):
        return 0.0
    left_values = [float(value) for value in left]
    right_values = [float(value) for value in right]
    left_norm = math.sqrt(sum(value * value for value in left_values))
    right_norm = math.sqrt(sum(value * value for value in right_values))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return float(
        sum(a * b for a, b in zip(left_values, right_values)) / (left_norm * right_norm)
    )


def _stored_embedding(row: FaceEmbedding) -> list[float]:
    try:
        vector = json.loads(decrypt_secret(row.encrypted_embedding))
    except (ValueError, json.JSONDecodeError) as exc:
        raise AppError(500, "internal_error", "Stored biometric data is corrupt") from exc
    if not isinstance(vector, list) or not vector or not all(_is_finite_number(value) for value in vector):
        raise AppError(500, "internal_error", "Stored biometric data is corrupt")
    return [float(value) for value in vector]


def register_embeddings(
    db: Session,
    student: Student,
    analysis: FrameAnalysis,
    config: Settings = settings,
) -> int:
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
                encrypted_embedding=encrypt_secret(json.dumps(embedding)),
                model_name=config.face_model_name,
                vector_version=VECTOR_VERSION,
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
