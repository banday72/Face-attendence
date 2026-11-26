from __future__ import annotations

from datetime import date

from sqlalchemy import Date, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AcademicHoliday(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "academic_holidays"

    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True, index=True)
    holiday_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    holiday_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Holiday", server_default="Holiday"
    )
    description: Mapped[str | None] = mapped_column(String(500))
