from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.class_ import Class_
    from app.models.course import Course
    from app.models.department import Department


class Semester(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "semesters"

    name: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    number: Mapped[int | None] = mapped_column(Integer, index=True)
    academic_year: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    session: Mapped[str | None] = mapped_column(String(100))
    department_id: Mapped[str | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), index=True
    )
    program: Mapped[str | None] = mapped_column(String(120))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    registration_start: Mapped[date | None] = mapped_column(Date)
    registration_end: Mapped[date | None] = mapped_column(Date)
    exam_start: Mapped[date | None] = mapped_column(Date)
    exam_end: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    classes: Mapped[list[Class_]] = relationship(back_populates="semester")
    department: Mapped[Department | None] = relationship()
    courses: Mapped[list[Course]] = relationship(
        secondary="course_semesters", back_populates="semesters"
    )
