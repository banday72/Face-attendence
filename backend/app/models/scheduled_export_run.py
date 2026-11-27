from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ScheduledExportRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "scheduled_export_runs"

    schedule_id: Mapped[str] = mapped_column(
        ForeignKey("scheduled_report_exports.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ready", server_default="ready", index=True, nullable=False)
    error: Mapped[str | None] = mapped_column(String(500))
