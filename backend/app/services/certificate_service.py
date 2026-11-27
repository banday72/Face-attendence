from __future__ import annotations

import re
from datetime import datetime
from io import BytesIO
from typing import TYPE_CHECKING, Any

from app.utils.uuid import new_uuid, utcnow

if TYPE_CHECKING:
    from app.models import Student
    from app.schemas.reports import ReportRecordOut

ATTENDED_STATUSES = {"present", "late"}


def certificate_filename(student: Student, extension: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", student.university_id).strip("_").upper() or "STUDENT"
    timestamp = utcnow().strftime("%Y%m%d_%H%M%S")
    return f"attendance_certificate_{stem}_{timestamp}.{extension}"


def _period_label(from_date: datetime | None, to_date: datetime | None) -> str:
    start = from_date.strftime("%Y-%m-%d") if from_date else "Beginning of records"
    end = to_date.strftime("%Y-%m-%d") if to_date else utcnow().strftime("%Y-%m-%d")
    return f"{start} to {end}"


def _summary(records: list[ReportRecordOut]) -> tuple[int, int, float]:
    total = len(records)
    attended = sum(1 for record in records if record.status in ATTENDED_STATUSES)
    return total, attended, round(attended / total * 100, 2) if total else 0.0


def export_certificate(
    *,
    student: Student,
    records: list[ReportRecordOut],
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    course_id: str | None = None,
) -> tuple[bytes, str, str]:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    total, attended, rate = _summary(records)
    issued_at = utcnow()
    certificate_id = f"AC-{new_uuid()[:8].upper()}"
    course_label = "All courses"
    if course_id:
        course_label = records[0].course_code if records else course_id
    full_name = student.user.full_name if student.user else student.university_id

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        title="Certificate of Attendance",
        author="Smart University Attendance System",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CertificateTitle",
        parent=styles["Heading1"],
        alignment=TA_CENTER,
        fontSize=22,
        spaceAfter=12,
    )
    subtitle_style = ParagraphStyle(
        "CertificateSubtitle",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=10,
        textColor=colors.HexColor("#6b7280"),
    )
    elements: list[Any] = [
        Paragraph("Certificate of Attendance", title_style),
        Paragraph("Smart University Attendance System", subtitle_style),
        Spacer(1, 18),
    ]

    identity_data = [
        ["Certificate ID", certificate_id],
        ["Student", full_name],
        ["University ID", student.university_id],
        ["Program", student.program or "-"],
        ["Attendance period", _period_label(from_date, to_date)],
        ["Course", course_label],
    ]
    summary_data = [
        ["Marked records", str(total)],
        ["Present or late", str(attended)],
        ["Attendance rate", f"{rate:.2f}%"],
        ["Issued at", issued_at.strftime("%Y-%m-%d %H:%M:%S")],
    ]

    identity_table = Table(identity_data, colWidths=[120, 470])
    identity_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (1, 0), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
            ]
        )
    )
    summary_table = Table(summary_data, colWidths=[180, 230])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (1, 0), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
            ]
        )
    )
    elements.extend([identity_table, Spacer(1, 16), summary_table, Spacer(1, 24)])
    elements.append(
        Paragraph(
            "This certificate was generated from attendance records marked for the period shown above.",
            styles["Normal"],
        )
    )
    document.build(elements)
    return buffer.getvalue(), "application/pdf", certificate_filename(student, "pdf")
