from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.core.deps import DB_Dependency
from app.core.errors import AppError

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "smart-university-attendance"}


@router.get("/ready")
def ready(db: DB_Dependency) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise AppError(503, "service_unavailable", "Database is not ready") from exc
    return {"status": "ok", "database": "ok"}
