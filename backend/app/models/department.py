from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.class_ import Class_
    from app.models.course import Course
    from app.models.professor import Professor
    from app.models.student import Student


class Department(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))

    courses: Mapped[list[Course]] = relationship(back_populates="department", cascade="all, delete-orphan")
    professors: Mapped[list[Professor]] = relationship(back_populates="department")
    students: Mapped[list[Student]] = relationship(back_populates="department")
    classes: Mapped[list[Class_]] = relationship(back_populates="department")
