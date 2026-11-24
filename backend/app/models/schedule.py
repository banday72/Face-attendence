from __future__ import annotations

from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.class_ import Class_
    from app.models.classroom import Classroom


class Schedule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "schedules"
    __table_args__ = (
        UniqueConstraint("class_id", "day_of_week", "start_time", name="uq_schedules_class_day_start"),
    )

    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True, nullable=False)
    classroom_id: Mapped[str | None] = mapped_column(ForeignKey("classrooms.id", ondelete="SET NULL"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    class_: Mapped[Class_] = relationship(back_populates="schedules")
    classroom: Mapped[Classroom | None] = relationship(back_populates="schedules")
