from __future__ import annotations

from datetime import datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import generate_refresh_token, hash_token
from app.models import RegistrationInvite
from app.utils.uuid import utcnow

InviteStatus = Literal["pending", "used", "revoked", "expired"]


def new_invite_token() -> str:
    return generate_refresh_token()


def invite_url(token: str) -> str:
    return f"{settings.public_app_url.rstrip('/')}/join/{token}"


def invite_status(invite: RegistrationInvite, now: datetime | None = None) -> InviteStatus:
    current = now or utcnow()
    if invite.revoked_at is not None:
        return "revoked"
    if invite.used_at is not None:
        return "used"
    if invite.expires_at <= current:
        return "expired"
    return "pending"


def get_pending_invite(db: Session, token: str) -> RegistrationInvite:
    invite = db.scalar(
        select(RegistrationInvite).where(RegistrationInvite.token_hash == hash_token(token.strip()))
    )
    if invite is None:
        raise AppError(404, "not_found", "Invite link is invalid")
    status = invite_status(invite)
    if status == "used":
        message = "This invite link has already been used"
    elif status == "revoked":
        message = "This invite link has been revoked"
    else:
        message = "This invite link has expired"
    if status != "pending":
        raise AppError(410, "invite_unavailable", message)
    return invite
