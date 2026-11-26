"""add semesters and class professor assignments

Revision ID: 7a1c9e2f4b60
Revises: 4e7c8a1b92d6
Create Date: 2026-11-26 12:30:00.000000
"""
from __future__ import annotations

import re
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy import MetaData, text

from alembic import op
from app.utils.uuid import new_uuid

revision = "7a1c9e2f4b60"
down_revision = "4e7c8a1b92d6"
branch_labels = None
depends_on = None


def _slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").upper()[:20] or "TERM"


def _academic_year(value: str) -> str:
    match = re.search(r"(?:19|20)\d{2}", value)
    return match.group(0) if match else str(datetime.now(UTC).year)


def upgrade() -> None:
    op.create_table(
        "semesters",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_semesters")),
        sa.UniqueConstraint("code", name=op.f("uq_semesters_code")),
        sa.UniqueConstraint("name", name=op.f("uq_semesters_name")),
    )
    op.create_index(op.f("ix_semesters_code"), "semesters", ["code"], unique=True)
    op.create_index(op.f("ix_semesters_name"), "semesters", ["name"], unique=True)
    op.create_index(op.f("ix_semesters_academic_year"), "semesters", ["academic_year"], unique=False)
    op.create_index(op.f("ix_semesters_is_active"), "semesters", ["is_active"], unique=False)
    op.create_index(
        "uq_semesters_single_active",
        "semesters",
        ["is_active"],
        unique=True,
        sqlite_where=text("is_active = 1"),
        postgresql_where=text("is_active IS TRUE"),
    )

    connection = op.get_bind()

    op.add_column("classes", sa.Column("semester_id", sa.String(length=36), nullable=True))
    op.create_index(op.f("ix_classes_semester_id"), "classes", ["semester_id"], unique=False)
    if connection.dialect.name != "sqlite":
        op.create_foreign_key(
            op.f("fk_classes_semester_id_semesters"),
            "classes",
            "semesters",
            ["semester_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "class_professors",
        sa.Column("class_id", sa.String(length=36), nullable=False),
        sa.Column("professor_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["class_id"], ["classes.id"], name=op.f("fk_class_professors_class_id_classes"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["professor_id"],
            ["professors.id"],
            name=op.f("fk_class_professors_professor_id_professors"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("class_id", "professor_id", name=op.f("pk_class_professors")),
    )

    metadata = MetaData()
    classes = sa.Table("classes", metadata, autoload_with=connection)
    semesters = sa.Table("semesters", metadata, autoload_with=connection)
    terms = [
        row[0]
        for row in connection.execute(sa.select(classes.c.term).distinct())
        if row[0]
    ]
    now = datetime.now(UTC).replace(tzinfo=None)
    used_codes: set[str] = set()
    created: list[tuple[str, str]] = []
    for index, term in enumerate(sorted(set(terms)), start=1):
        code = _slug(str(term))
        while code in used_codes:
            code = f"{_slug(str(term))[:17]}-{index}"
            index += 1
        used_codes.add(code)
        semester_id = new_uuid()
        connection.execute(
            semesters.insert().values(
                id=semester_id,
                name=str(term)[:150],
                code=code,
                academic_year=_academic_year(str(term)),
                start_date=None,
                end_date=None,
                is_active=False,
                created_at=now,
                updated_at=now,
            )
        )
        connection.execute(
            classes.update().where(classes.c.term == term).values(semester_id=semester_id)
        )
        created.append((semester_id, _academic_year(str(term))))
    if created:
        current = max(created, key=lambda item: item[1])[0]
        connection.execute(
            semesters.update().where(semesters.c.id == current).values(is_active=True, updated_at=now)
        )


def downgrade() -> None:
    connection = op.get_bind()

    op.drop_table("class_professors")
    op.drop_index(op.f("ix_classes_semester_id"), table_name="classes")
    if connection.dialect.name != "sqlite":
        op.drop_constraint(op.f("fk_classes_semester_id_semesters"), "classes", type_="foreignkey")
    op.drop_column("classes", "semester_id")
    op.drop_index("uq_semesters_single_active", table_name="semesters")
    op.drop_index(op.f("ix_semesters_is_active"), table_name="semesters")
    op.drop_index(op.f("ix_semesters_academic_year"), table_name="semesters")
    op.drop_index(op.f("ix_semesters_name"), table_name="semesters")
    op.drop_index(op.f("ix_semesters_code"), table_name="semesters")
    op.drop_table("semesters")
