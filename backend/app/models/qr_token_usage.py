from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.attendance_session import AttendanceSession
    from app.models.student import Student


class QRTokenUsage(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "qr_token_usages"
    __table_args__ = (
        UniqueConstraint("session_id", "token_hash", "student_id", name="uq_qr_token_usages_session_token_student"),
    )

    session_id: Mapped[str] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    session: Mapped[AttendanceSession] = relationship(back_populates="qr_usages")
    student: Mapped[Student] = relationship()
