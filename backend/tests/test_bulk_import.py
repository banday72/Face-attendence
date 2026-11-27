from __future__ import annotations

import csv
import io

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, BulkImportUpload, User
from tests.conftest import create_user, login_headers


def _csv_bytes(rows: list[list[str]]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "role",
            "full_name",
            "email",
            "password",
            "university_id",
            "employee_id",
            "department",
            "phone",
            "program",
            "year_level",
            "title",
            "office",
        ]
    )
    for row in rows:
        writer.writerow(row)
    return output.getvalue().encode("utf-8")


def test_bulk_template_preview_import_and_history(
    client: TestClient, db_session: Session
) -> None:
    create_user(db_session, email="bulk.admin@university.edu", password="Admin123!", role="admin")
    admin_headers = login_headers(client, "bulk.admin@university.edu", "Admin123!")

    template = client.get("/api/v1/admin/users/bulk/template", headers=admin_headers)
    assert template.status_code == 200, template.text
    assert template.headers["content-type"].startswith("text/csv")
    assert "role,full_name,email,password" in template.text
    assert "users_bulk_template.csv" in template.headers["content-disposition"]

    valid_row = [
        "student",
        "Bulk Student",
        "bulk.student@university.edu",
        "Student123!",
        "STU-BULK-1",
        "",
        "",
        "",
        "Computer Science",
        "2",
        "",
        "",
    ]
    csv_content = _csv_bytes(
        [
            valid_row,
            [
                "student",
                "Invalid Student",
                "bulk.student@university.edu",
                "Student123!",
                "STU-BULK-2",
                "",
                "",
                "",
                "",
                "2",
                "",
                "",
            ],
            [
                "student",
                "Weak Password",
                "weak@university.edu",
                "weak",
                "STU-BULK-3",
                "",
                "",
                "",
                "",
                "2",
                "",
                "",
            ],
        ]
    )

    preview = client.post(
        "/api/v1/admin/users/bulk/preview",
        headers=admin_headers,
        files={"file": ("users.csv", csv_content, "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["total"] == 3
    assert body["valid"] == 2
    assert len(body["errors"]) == 1
    assert [error["row"] for error in body["errors"]] == [4]
    assert body["samples"][0]["email"] == "bulk.student@university.edu"
    assert body["samples"][0]["password"] == "********"
    assert all("Student123!" not in error["error"] for error in body["errors"])

    imported = client.post(
        "/api/v1/admin/users/bulk",
        headers=admin_headers,
        files={"file": ("users.csv", csv_content, "text/csv")},
    )
    assert imported.status_code == 200, imported.text
    result = imported.json()
    assert result["total"] == 3
    assert result["created"] == 1
    assert result["failed"] == 2
    assert result["upload_id"]
    assert db_session.scalar(
        select(User).where(User.email == "bulk.student@university.edu")
    ) is not None

    uploads = client.get("/api/v1/admin/users/bulk/uploads", headers=admin_headers)
    assert uploads.status_code == 200, uploads.text
    assert uploads.json()["total"] == 1
    item = uploads.json()["items"][0]
    assert item["id"] == result["upload_id"]
    assert item["actor_name"] == "Test User"
    assert item["created"] == 1
    assert item["failed"] == 2

    upload = db_session.get(BulkImportUpload, result["upload_id"])
    assert upload is not None
    assert len(upload.errors) == 2

    error_csv = client.get(
        f"/api/v1/admin/users/bulk/uploads/{result['upload_id']}/errors.csv",
        headers=admin_headers,
    )
    assert error_csv.status_code == 200
    assert "weak@university.edu" in error_csv.text
    assert "row,email,error" in error_csv.text

    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "user.bulk_import"))
    assert log is not None
    assert log.after_json["created"] == 1
    assert log.after_json["failed"] == 2


def test_bulk_import_rejects_invalid_csv(client: TestClient, db_session: Session) -> None:
    create_user(db_session, email="bulk2.admin@university.edu", password="Admin123!", role="admin")
    admin_headers = login_headers(client, "bulk2.admin@university.edu", "Admin123!")

    empty = client.post(
        "/api/v1/admin/users/bulk/preview",
        headers=admin_headers,
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert empty.status_code == 422

    missing_columns = client.post(
        "/api/v1/admin/users/bulk/preview",
        headers=admin_headers,
        files={"file": ("bad.csv", b"email,password\na@b.com,Pass123!\n", "text/csv")},
    )
    assert missing_columns.status_code == 422

    create_user(
        db_session,
        email="bulk.viewer@university.edu",
        password="Student123!",
        role="student",
    )
    student_headers = login_headers(client, "bulk.viewer@university.edu", "Student123!")
    denied = client.get("/api/v1/admin/users/bulk/template", headers=student_headers)
    assert denied.status_code == 403
