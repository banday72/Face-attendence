"""add student registration invites

Revision ID: c7d9e1f4a8b2
Revises: b4e2f6a9c7d1
Create Date: 2026-11-28 10:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c7d9e1f4a8b2"
down_revision = "b4e2f6a9c7d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registration_invites",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("university_id", sa.String(length=50), nullable=False),
        sa.Column("department_id", sa.String(length=36), nullable=True),
        sa.Column("program", sa.String(length=120), nullable=True),
        sa.Column("year_level", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="fk_registration_invites_department_id_departments",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_registration_invites_created_by_user_id_users",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_registration_invites_token_hash", "registration_invites", ["token_hash"], unique=True)
    op.create_index("ix_registration_invites_email", "registration_invites", ["email"])
    op.create_index("ix_registration_invites_university_id", "registration_invites", ["university_id"])
    op.create_index("ix_registration_invites_department_id", "registration_invites", ["department_id"])
    op.create_index("ix_registration_invites_expires_at", "registration_invites", ["expires_at"])
    op.create_index("ix_registration_invites_used_at", "registration_invites", ["used_at"])
    op.create_index("ix_registration_invites_revoked_at", "registration_invites", ["revoked_at"])
    op.create_index("ix_registration_invites_created_by_user_id", "registration_invites", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_table("registration_invites")
