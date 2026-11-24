from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.attendance_session import AttendanceSession
    from app.models.course import Course
    from app.models.department import Department
    from app.models.enrollment import Enrollment
    from app.models.professor import Professor
    from app.models.schedule import Schedule


class Class_(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "classes"
    __table_args__ = (UniqueConstraint("course_id", "section", "term", name="uq_classes_course_section_term"),)

    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False)
    professor_id: Mapped[str | None] = mapped_column(
        ForeignKey("professors.id", ondelete="SET NULL"), index=True
    )
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    section: Mapped[str] = mapped_column(String(30), nullable=False)
    term: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str | None] = mapped_column(String(150))
    capacity: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    course: Mapped[Course] = relationship(back_populates="classes")
    professor: Mapped[Professor | None] = relationship(back_populates="classes")
    department: Mapped[Department | None] = relationship(back_populates="classes")
    enrollments: Mapped[list[Enrollment]] = relationship(back_populates="class_", cascade="all, delete-orphan")
    schedules: Mapped[list[Schedule]] = relationship(back_populates="class_", cascade="all, delete-orphan")
    sessions: Mapped[list[AttendanceSession]] = relationship(back_populates="class_", cascade="all, delete-orphan")
