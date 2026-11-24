from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, String, Table

from app.db.base import Base
from app.utils.uuid import utcnow

course_professors = Table(
    "course_professors",
    Base.metadata,
    Column("course_id", String(36), ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True),
    Column("professor_id", String(36), ForeignKey("professors.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, nullable=False, default=utcnow),
)
