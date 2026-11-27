from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.attendance_record import AttendanceRecord
    from app.models.attendance_session import AttendanceSession
    from app.models.student import Student
    from app.models.user import User


class AttendanceCorrectionRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "attendance_correction_requests"
    __table_args__ = (
        Index(
            "uq_correction_requests_pending",
            "student_id",
            "session_id",
            unique=True,
            sqlite_where=text("status = 'pending'"),
            postgresql_where=text("status = 'pending'"),
        ),
    )

    student_id: Mapped[str] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True, nullable=False)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    record_id: Mapped[str | None] = mapped_column(
        ForeignKey("attendance_records.id", ondelete="SET NULL"), index=True
    )
    requested_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    review_note: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending", index=True, nullable=False)
    reviewed_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    student: Mapped[Student] = relationship()
    session: Mapped[AttendanceSession] = relationship()
    record: Mapped[AttendanceRecord | None] = relationship()
    reviewer: Mapped[User | None] = relationship()
