"""add performance indexes

Revision ID: 9f3a1c7d52e4
Revises: 4c1f2e9d7a6b
Create Date: 2026-11-26 10:00:00.000000

"""
from __future__ import annotations

from alembic import op

revision = '9f3a1c7d52e4'
down_revision = '4c1f2e9d7a6b'
branch_labels = None
depends_on = None


INDEXES = (
    ('ix_attendance_records_student_marked_at', 'attendance_records', ['student_id', 'marked_at']),
    ('ix_attendance_sessions_class_starts_at', 'attendance_sessions', ['class_id', 'starts_at']),
    ('ix_attendance_sessions_status_starts_at_ends_at', 'attendance_sessions', ['status', 'starts_at', 'ends_at']),
    ('ix_audit_logs_created_at', 'audit_logs', ['created_at']),
    ('ix_audit_logs_entity_type_created_at', 'audit_logs', ['entity_type', 'created_at']),
)


def upgrade() -> None:
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, _table, _columns in reversed(INDEXES):
        op.drop_index(name)
