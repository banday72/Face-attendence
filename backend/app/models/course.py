from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.course_professor import course_professors
from app.models.course_semester import course_semesters

if TYPE_CHECKING:
    from app.models.class_ import Class_
    from app.models.department import Department
    from app.models.professor import Professor
    from app.models.semester import Semester


class Course(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "courses"

    code: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    description: Mapped[str | None] = mapped_column(String(500))
    course_type: Mapped[str] = mapped_column(
        String(20), default="theoretical", nullable=False, server_default="theoretical"
    )

    department: Mapped[Department] = relationship(back_populates="courses")
    classes: Mapped[list[Class_]] = relationship(back_populates="course", cascade="all, delete-orphan")
    professors: Mapped[list[Professor]] = relationship(
        secondary=course_professors, back_populates="courses"
    )
    semesters: Mapped[list[Semester]] = relationship(
        secondary=course_semesters, back_populates="courses"
    )
