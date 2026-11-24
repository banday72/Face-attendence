from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import hash_token
from app.models import AttendanceSession, QRTokenUsage
from app.utils.uuid import new_uuid, utcnow


@dataclass(frozen=True)
class IssuedQR:
    payload: str
    token_hash: str
    expires_at: datetime
    generation: int
    refresh_after_seconds: int


def issue_qr(db: Session, session: AttendanceSession) -> IssuedQR:
    payload = f"uat:v1:{secrets.token_urlsafe(32)}"
    token_hash = hash_token(payload)
    expires_at = utcnow() + timedelta(seconds=session.qr_validity_seconds)
    session.current_qr_hash = token_hash
    session.current_qr_expires_at = expires_at
    session.qr_generation += 1
    db.flush()
    return IssuedQR(
        payload=payload,
        token_hash=token_hash,
        expires_at=expires_at,
        generation=session.qr_generation,
        refresh_after_seconds=session.qr_refresh_seconds,
    )


def clear_qr(db: Session, session: AttendanceSession) -> None:
    session.current_qr_hash = None
    session.current_qr_expires_at = None
    db.flush()


def validate_qr_token(db: Session, session: AttendanceSession, payload: str, now: datetime) -> str:
    token_hash = hash_token(payload)
    if session.current_qr_hash != token_hash:
        raise AppError(403, "conflict", "QR token is no longer valid", {"code_detail": "qr_token_invalid"})
    if session.current_qr_expires_at is None or now > session.current_qr_expires_at:
        raise AppError(403, "session_expired", "QR token has expired")
    return token_hash


def consume_qr_token(
    db: Session,
    session: AttendanceSession,
    token_hash: str,
    student_id: str,
    now: datetime,
) -> None:
    used = db.scalar(select_qr_usage(session.id, token_hash, student_id))
    if used is not None:
        raise AppError(
            409,
            "duplicate_attendance",
            "This QR token has already been used for this session",
            {"code_detail": "qr_token_used"},
        )
    try:
        with db.begin_nested():
            db.add(
                QRTokenUsage(
                    id=new_uuid(),
                    session_id=session.id,
                    token_hash=token_hash,
                    student_id=student_id,
                    used_at=now,
                    created_at=now,
                )
            )
            db.flush()
    except IntegrityError as exc:
        raise AppError(
            409,
            "duplicate_attendance",
            "This QR token has already been used for this session",
            {"code_detail": "qr_token_used"},
        ) from exc


def select_qr_usage(session_id: str, token_hash: str, student_id: str):
    from sqlalchemy import select

    return select(QRTokenUsage).where(
        QRTokenUsage.session_id == session_id,
        QRTokenUsage.token_hash == token_hash,
        QRTokenUsage.student_id == student_id,
    )
