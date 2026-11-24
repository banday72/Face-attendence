from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.class_ import Class_
    from app.models.department import Department
    from app.models.user import User


class Professor(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "professors"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    employee_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    title: Mapped[str | None] = mapped_column(String(50))
    office: Mapped[str | None] = mapped_column(String(80))

    user: Mapped[User] = relationship(back_populates="professor")
    department: Mapped[Department | None] = relationship(back_populates="professors")
    classes: Mapped[list[Class_]] = relationship(back_populates="professor")
