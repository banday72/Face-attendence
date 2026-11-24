from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.attendance_session import AttendanceSession
    from app.models.schedule import Schedule


class Classroom(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "classrooms"

    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    building: Mapped[str | None] = mapped_column(String(100))
    room: Mapped[str | None] = mapped_column(String(30))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    radius_override_meters: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    schedules: Mapped[list[Schedule]] = relationship(back_populates="classroom")
    sessions: Mapped[list[AttendanceSession]] = relationship(back_populates="classroom")
