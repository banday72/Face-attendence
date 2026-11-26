"""replace legacy face embeddings

Revision ID: 4e7c8a1b92d6
Revises: 9f3a1c7d52e4
Create Date: 2026-11-26 11:20:00.000000

"""
from __future__ import annotations

from sqlalchemy import MetaData, Table, delete, func, update

from alembic import op

revision = "4e7c8a1b92d6"
down_revision = "9f3a1c7d52e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    metadata = MetaData()
    face_embeddings = Table("face_embeddings", metadata, autoload_with=connection)
    biometric_consents = Table("biometric_consents", metadata, autoload_with=connection)
    connection.execute(delete(face_embeddings))
    connection.execute(
        update(biometric_consents)
        .where(biometric_consents.c.is_active.is_(True))
        .values(is_active=False, revoked_at=func.now(), updated_at=func.now())
    )


def downgrade() -> None:
    return None
