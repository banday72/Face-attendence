from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class BulkImportUpload(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bulk_import_uploads"

    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)

    actor: Mapped[User | None] = relationship()
