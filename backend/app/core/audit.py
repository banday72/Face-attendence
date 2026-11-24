from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.utils.uuid import new_uuid, utcnow


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def write_audit_log(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None,
    actor: Any | None = None,
    actor_id: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    reason: str | None = None,
    request: Request | None = None,
) -> AuditLog:
    resolved_actor_id = actor_id or getattr(actor, "id", None)
    ip_address = None
    user_agent = None
    if request is not None:
        from app.core.deps import client_ip

        ip_address = client_ip(request)
        user_agent = request.headers.get("user-agent")

    entry = AuditLog(
        id=new_uuid(),
        actor_user_id=resolved_actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        before_json=_json_safe(before or {}),
        after_json=_json_safe(after or {}),
        reason=reason,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=utcnow(),
    )
    db.add(entry)
    db.flush()
    return entry
