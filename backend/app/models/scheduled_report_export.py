from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ScheduledReportExport(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "scheduled_report_exports"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    format: Mapped[str] = mapped_column(String(10), default="xlsx", server_default="xlsx", nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), default="weekly", server_default="weekly", nullable=False)
    filters: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    next_run_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False, index=True
    )
