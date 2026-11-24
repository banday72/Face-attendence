from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.attendance_session import AttendanceSession
    from app.models.student import Student
    from app.models.user import User


class AttendanceRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_attendance_records_session_student"),
    )

    session_id: Mapped[str] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="present", index=True, nullable=False)
    method: Mapped[str] = mapped_column(String(20), default="qr", index=True, nullable=False)
    marked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    accuracy: Mapped[float | None] = mapped_column(Float)
    face_score: Mapped[float | None] = mapped_column(Float)
    location_status: Mapped[str] = mapped_column(String(20), default="not_required", nullable=False)
    face_status: Mapped[str] = mapped_column(String(20), default="not_required", nullable=False)
    challenge: Mapped[str | None] = mapped_column(String(40))
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    correction_reason: Mapped[str | None] = mapped_column(String(500))
    corrected_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)

    session: Mapped[AttendanceSession] = relationship(back_populates="attendance_records")
    student: Mapped[Student] = relationship(back_populates="attendance_records")
    corrected_by: Mapped[User | None] = relationship(back_populates="corrected_records")
