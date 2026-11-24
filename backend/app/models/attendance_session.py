from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.attendance_record import AttendanceRecord
    from app.models.class_ import Class_
    from app.models.classroom import Classroom
    from app.models.professor import Professor
    from app.models.qr_token_usage import QRTokenUsage


class AttendanceSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "attendance_sessions"

    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True, nullable=False)
    classroom_id: Mapped[str | None] = mapped_column(ForeignKey("classrooms.id", ondelete="SET NULL"), index=True)
    professor_id: Mapped[str | None] = mapped_column(ForeignKey("professors.id", ondelete="SET NULL"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="scheduled", index=True, nullable=False)
    require_face: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    require_location: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    late_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    qr_validity_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    qr_refresh_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    challenge: Mapped[str | None] = mapped_column(String(40))
    current_qr_hash: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    current_qr_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    qr_generation: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500))

    class_: Mapped[Class_] = relationship(back_populates="sessions")
    classroom: Mapped[Classroom | None] = relationship(back_populates="sessions")
    professor: Mapped[Professor | None] = relationship()
    attendance_records: Mapped[list[AttendanceRecord]] = relationship(back_populates="session", cascade="all, delete-orphan")
    qr_usages: Mapped[list[QRTokenUsage]] = relationship(back_populates="session", cascade="all, delete-orphan")
