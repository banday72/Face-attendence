from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.student import Student


class FaceEmbedding(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "face_embeddings"

    student_id: Mapped[str] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True, nullable=False)
    encrypted_embedding: Mapped[str] = mapped_column(Text, nullable=False)
    model_name: Mapped[str] = mapped_column(String(80), nullable=False)
    vector_version: Mapped[str] = mapped_column(String(20), default="1", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)

    student: Mapped[Student] = relationship(back_populates="face_embeddings")
