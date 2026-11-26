from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.class_ import Class_
    from app.models.classroom import Classroom
    from app.models.course import Course
    from app.models.department import Department
    from app.models.professor import Professor
    from app.models.semester import Semester


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

    schedule_group_id: Mapped[str | None] = mapped_column(String(36), index=True)
    department_id: Mapped[str | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), index=True
    )
    semester_id: Mapped[str | None] = mapped_column(
        ForeignKey("semesters.id", ondelete="SET NULL"), index=True
    )
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    professor_id: Mapped[str | None] = mapped_column(ForeignKey("professors.id", ondelete="SET NULL"), index=True)
    class_type: Mapped[str] = mapped_column(String(30), nullable=False, default="Lecture", server_default="Lecture")
    notes: Mapped[str | None] = mapped_column(Text)

    recurrence_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="weekly", server_default="weekly", index=True
    )
    start_date: Mapped[date | None] = mapped_column(Date, index=True)
    end_date: Mapped[date | None] = mapped_column(Date, index=True)
    repeat_days: Mapped[list[int] | None] = mapped_column(JSON)
    custom_dates: Mapped[list[str] | None] = mapped_column(JSON)
    holiday_dates: Mapped[list[str] | None] = mapped_column(JSON)
    monthly_mode: Mapped[str | None] = mapped_column(String(20))
    exclude_holidays: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false(), index=True
    )

    class_: Mapped[Class_] = relationship(back_populates="schedules")
    classroom: Mapped[Classroom | None] = relationship(back_populates="schedules")
    department: Mapped[Department | None] = relationship()
    semester: Mapped[Semester | None] = relationship()
    course: Mapped[Course | None] = relationship()
    professor: Mapped[Professor | None] = relationship()
