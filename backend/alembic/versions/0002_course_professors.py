"""add course professor assignments

Revision ID: 4c1f2e9d7a6b
Revises: 80d44692b864
Create Date: 2026-11-24 20:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = '4c1f2e9d7a6b'
down_revision = '80d44692b864'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'course_professors',
        sa.Column('course_id', sa.String(length=36), nullable=False),
        sa.Column('professor_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ['course_id'], ['courses.id'], name=op.f('fk_course_professors_course_id_courses'), ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['professor_id'], ['professors.id'], name=op.f('fk_course_professors_professor_id_professors'), ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('course_id', 'professor_id', name=op.f('pk_course_professors')),
    )


def downgrade() -> None:
    op.drop_table('course_professors')
