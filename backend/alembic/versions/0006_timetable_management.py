"""add timetable management fields and supporting tables

Revision ID: 9c2f7a4b81d3
Revises: 7a1c9e2f4b60
Create Date: 2026-11-26 13:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

revision = "9c2f7a4b81d3"
down_revision = "7a1c9e2f4b60"
branch_labels = None
depends_on = None


SCHEDULE_COLUMNS = [
    ("schedule_group_id", sa.String(length=36)),
    ("department_id", sa.String(length=36)),
    ("semester_id", sa.String(length=36)),
    ("course_id", sa.String(length=36)),
    ("professor_id", sa.String(length=36)),
    ("class_type", sa.String(length=30)),
    ("notes", sa.String(length=1000)),
    ("recurrence_type", sa.String(length=20)),
    ("start_date", sa.Date()),
    ("end_date", sa.Date()),
    ("repeat_days", sa.JSON()),
    ("custom_dates", sa.JSON()),
    ("holiday_dates", sa.JSON()),
    ("monthly_mode", sa.String(length=20)),
    ("exclude_holidays", sa.Boolean()),
]


def _add_foreign_key(table: str, name: str, column: str, target: str) -> None:
    connection = op.get_bind()
    if connection.dialect.name == "sqlite":
        return
    op.create_foreign_key(op.f(name), table, target, [column], ["id"], ondelete="SET NULL")


def _drop_index_if_exists(name: str, table_name: str) -> None:
    connection = op.get_bind()
    indexes = sa.inspect(connection).get_indexes(table_name)
    if any(index["name"] == name for index in indexes):
        op.drop_index(name, table_name=table_name)


def _make_required(table: str, column: str, column_type: sa.types.TypeEngine, default: object) -> None:
    connection = op.get_bind()
    if connection.dialect.name == "sqlite":
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column(
                column, nullable=False, server_default=default, existing_type=column_type
            )
        return
    op.alter_column(
        table, column, nullable=False, server_default=default, existing_type=column_type
    )


def upgrade() -> None:
    connection = op.get_bind()

    for column_name, column_type in SCHEDULE_COLUMNS:
        op.add_column("schedules", sa.Column(column_name, column_type, nullable=True))

    false_value = "FALSE" if connection.dialect.name != "sqlite" else "0"
    op.execute(
        text(
            "UPDATE schedules SET recurrence_type = 'weekly', "
            f"class_type = 'Lecture', exclude_holidays = {false_value} "
            "WHERE recurrence_type IS NULL"
        )
    )
    op.execute(
        text(
            "UPDATE schedules SET course_id = (SELECT course_id FROM classes "
            "WHERE classes.id = schedules.class_id), "
            "department_id = (SELECT department_id FROM classes WHERE classes.id = schedules.class_id), "
            "professor_id = (SELECT professor_id FROM classes WHERE classes.id = schedules.class_id)"
        )
    )
    _make_required("schedules", "class_type", sa.String(length=30), "Lecture")
    _make_required("schedules", "recurrence_type", sa.String(length=20), "weekly")
    _make_required("schedules", "exclude_holidays", sa.Boolean(), sa.false())

    for column_name in ("schedule_group_id", "department_id", "semester_id", "course_id", "professor_id", "start_date", "end_date", "recurrence_type"):
        op.create_index(op.f(f"ix_schedules_{column_name}"), "schedules", [column_name], unique=False)

    _add_foreign_key("schedules", "fk_schedules_department_id_departments", "department_id", "departments")
    _add_foreign_key("schedules", "fk_schedules_semester_id_semesters", "semester_id", "semesters")
    _add_foreign_key("schedules", "fk_schedules_course_id_courses", "course_id", "courses")
    _add_foreign_key("schedules", "fk_schedules_professor_id_professors", "professor_id", "professors")

    _drop_index_if_exists("uq_semesters_single_active", "semesters")
    op.add_column("semesters", sa.Column("number", sa.Integer(), nullable=True))
    op.add_column("semesters", sa.Column("department_id", sa.String(length=36), nullable=True))
    op.add_column("semesters", sa.Column("program", sa.String(length=120), nullable=True))
    op.add_column("semesters", sa.Column("session", sa.String(length=100), nullable=True))
    op.add_column("semesters", sa.Column("registration_start", sa.Date(), nullable=True))
    op.add_column("semesters", sa.Column("registration_end", sa.Date(), nullable=True))
    op.add_column("semesters", sa.Column("exam_start", sa.Date(), nullable=True))
    op.add_column("semesters", sa.Column("exam_end", sa.Date(), nullable=True))
    _add_foreign_key("semesters", "fk_semesters_department_id_departments", "department_id", "departments")
    op.create_index(op.f("ix_semesters_number"), "semesters", ["number"], unique=False)
    op.create_index(op.f("ix_semesters_department_id"), "semesters", ["department_id"], unique=False)

    op.add_column("classrooms", sa.Column("room_type", sa.String(length=30), nullable=True))
    op.add_column("classrooms", sa.Column("capacity", sa.Integer(), nullable=True))
    op.execute(text("UPDATE classrooms SET room_type = 'Classroom' WHERE room_type IS NULL"))
    _make_required("classrooms", "room_type", sa.String(length=30), "Classroom")

    op.add_column("courses", sa.Column("course_type", sa.String(length=20), nullable=True))
    op.execute(text("UPDATE courses SET course_type = 'theoretical' WHERE course_type IS NULL"))
    _make_required("courses", "course_type", sa.String(length=20), "theoretical")

    op.create_table(
        "course_semesters",
        sa.Column("course_id", sa.String(length=36), nullable=False),
        sa.Column("semester_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], name=op.f("fk_course_semesters_course_id_courses"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["semester_id"], ["semesters.id"], name=op.f("fk_course_semesters_semester_id_semesters"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("course_id", "semester_id", name=op.f("pk_course_semesters")),
    )

    op.create_table(
        "academic_holidays",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("holiday_type", sa.String(length=30), nullable=False, server_default="Holiday"),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_academic_holidays")),
        sa.UniqueConstraint("holiday_date", name=op.f("uq_academic_holidays_holiday_date")),
    )
    op.create_index(op.f("ix_academic_holidays_holiday_date"), "academic_holidays", ["holiday_date"], unique=True)

    if connection.dialect.name != "sqlite":
        for column in ("class_type", "recurrence_type", "exclude_holidays", "room_type", "course_type"):
            table = "classrooms" if column == "room_type" else "courses" if column == "course_type" else "schedules"
            op.alter_column(table, column, server_default=None, existing_type=sa.String(length=30) if column in ("class_type", "room_type") else sa.Boolean() if column == "exclude_holidays" else sa.String(length=20))


def downgrade() -> None:
    op.drop_table("academic_holidays")
    op.drop_table("course_semesters")
    op.drop_index(op.f("ix_semesters_department_id"), table_name="semesters")
    op.drop_index(op.f("ix_semesters_number"), table_name="semesters")
    connection = op.get_bind()
    if connection.dialect.name != "sqlite":
        op.drop_constraint(op.f("fk_semesters_department_id_departments"), "semesters", type_="foreignkey")
    for column in ("exam_end", "exam_start", "registration_end", "registration_start", "session", "program", "department_id", "number"):
        op.drop_column("semesters", column)
    op.create_index(
        "uq_semesters_single_active",
        "semesters",
        ["is_active"],
        unique=True,
        sqlite_where=text("is_active = 1"),
        postgresql_where=text("is_active IS TRUE"),
    )
    op.drop_column("courses", "course_type")
    op.drop_column("classrooms", "capacity")
    op.drop_column("classrooms", "room_type")
    for column_name in ("schedule_group_id", "department_id", "semester_id", "course_id", "professor_id", "start_date", "end_date", "recurrence_type"):
        op.drop_index(op.f(f"ix_schedules_{column_name}"), table_name="schedules")
    if connection.dialect.name != "sqlite":
        for name in ("fk_schedules_professor_id_professors", "fk_schedules_course_id_courses", "fk_schedules_semester_id_semesters", "fk_schedules_department_id_departments"):
            op.drop_constraint(op.f(name), "schedules", type_="foreignkey")
    for column_name, _ in reversed(SCHEDULE_COLUMNS):
        op.drop_column("schedules", column_name)
