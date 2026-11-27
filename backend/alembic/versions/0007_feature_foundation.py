"""add correction workflow, import history, and report feature tables

Revision ID: b4e2f6a9c7d1
Revises: 9c2f7a4b81d3
Create Date: 2026-11-27 14:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "b4e2f6a9c7d1"
down_revision = "9c2f7a4b81d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attendance_correction_requests",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("student_id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("record_id", sa.String(length=36), nullable=True),
        sa.Column("requested_status", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("review_note", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("reviewed_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_attendance_correction_requests_student_id", "attendance_correction_requests", ["student_id"])
    op.create_index("ix_attendance_correction_requests_session_id", "attendance_correction_requests", ["session_id"])
    op.create_index("ix_attendance_correction_requests_record_id", "attendance_correction_requests", ["record_id"])
    op.create_index("ix_attendance_correction_requests_status", "attendance_correction_requests", ["status"])
    op.create_index(
        "ix_attendance_correction_requests_reviewed_by_user_id",
        "attendance_correction_requests",
        ["reviewed_by_user_id"],
    )
    op.create_index("ix_attendance_correction_requests_created_at", "attendance_correction_requests", ["created_at"])
    op.execute(
        "CREATE UNIQUE INDEX uq_correction_requests_pending ON attendance_correction_requests "
        "(student_id, session_id) WHERE status = 'pending'"
    )
    op.create_foreign_key(
        "fk_attendance_correction_requests_student_id_students",
        "attendance_correction_requests",
        "students",
        ["student_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_attendance_correction_requests_session_id_attendance_sessions",
        "attendance_correction_requests",
        "attendance_sessions",
        ["session_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_attendance_correction_requests_record_id_attendance_records",
        "attendance_correction_requests",
        "attendance_records",
        ["record_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_attendance_correction_requests_reviewed_by_user_id_users",
        "attendance_correction_requests",
        "users",
        ["reviewed_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "bulk_import_uploads",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("total", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("errors", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_bulk_import_uploads_actor_user_id", "bulk_import_uploads", ["actor_user_id"])
    op.create_foreign_key(
        "fk_bulk_import_uploads_actor_user_id_users",
        "bulk_import_uploads",
        "users",
        ["actor_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "report_presets",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("report_type", sa.String(length=30), server_default="records", nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "name", name="uq_report_presets_user_name"),
    )
    op.create_index("ix_report_presets_user_id", "report_presets", ["user_id"])
    op.create_index("ix_report_presets_is_default", "report_presets", ["is_default"])
    op.create_foreign_key(
        "fk_report_presets_user_id_users",
        "report_presets",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_table(
        "scheduled_report_exports",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("format", sa.String(length=10), server_default="xlsx", nullable=False),
        sa.Column("frequency", sa.String(length=20), server_default="weekly", nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("next_run_at", sa.DateTime(), nullable=False),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_scheduled_report_exports_user_id", "scheduled_report_exports", ["user_id"])
    op.create_index("ix_scheduled_report_exports_next_run_at", "scheduled_report_exports", ["next_run_at"])
    op.create_index("ix_scheduled_report_exports_is_active", "scheduled_report_exports", ["is_active"])
    op.create_foreign_key(
        "fk_scheduled_report_exports_user_id_users",
        "scheduled_report_exports",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_table(
        "scheduled_export_runs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("schedule_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="ready", nullable=False),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_scheduled_export_runs_schedule_id", "scheduled_export_runs", ["schedule_id"])
    op.create_index("ix_scheduled_export_runs_user_id", "scheduled_export_runs", ["user_id"])
    op.create_index("ix_scheduled_export_runs_status", "scheduled_export_runs", ["status"])
    op.create_index("ix_scheduled_export_runs_created_at", "scheduled_export_runs", ["created_at"])
    op.create_foreign_key(
        "fk_scheduled_export_runs_schedule_id_scheduled_report_exports",
        "scheduled_export_runs",
        "scheduled_report_exports",
        ["schedule_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_scheduled_export_runs_user_id_users",
        "scheduled_export_runs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_table("scheduled_export_runs")
    op.drop_table("scheduled_report_exports")
    op.drop_table("report_presets")
    op.drop_table("bulk_import_uploads")
    op.execute("DROP INDEX uq_correction_requests_pending")
    op.drop_table("attendance_correction_requests")
