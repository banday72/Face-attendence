from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.attendance_record import AttendanceRecord
    from app.models.biometric_consent import BiometricConsent
    from app.models.department import Department
    from app.models.enrollment import Enrollment
    from app.models.face_embedding import FaceEmbedding
    from app.models.user import User


class Student(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "students"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    university_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    program: Mapped[str | None] = mapped_column(String(120))
    year_level: Mapped[int | None] = mapped_column(nullable=True)

    user: Mapped[User] = relationship(back_populates="student")
    department: Mapped[Department | None] = relationship(back_populates="students")
    enrollments: Mapped[list[Enrollment]] = relationship(back_populates="student", cascade="all, delete-orphan")
    attendance_records: Mapped[list[AttendanceRecord]] = relationship(
        back_populates="student", cascade="all, delete-orphan"
    )
    face_embeddings: Mapped[list[FaceEmbedding]] = relationship(
        back_populates="student", cascade="all, delete-orphan"
    )
    consent: Mapped[BiometricConsent | None] = relationship(
        back_populates="student", cascade="all, delete-orphan", uselist=False
    )
