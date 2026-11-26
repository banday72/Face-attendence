from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import Any, Literal, cast

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    AttendanceRecord,
    AttendanceSession,
    Class_,
    Course,
    Professor,
    Student,
    User,
)
from app.schemas.attendance import AttendanceMethod, AttendanceStatus
from app.schemas.reports import ReportPeriod, ReportRecordOut
from app.services.class_service import professor_class_filter
from app.utils.uuid import utcnow

ReportFormat = Literal["xlsx", "pdf"]
ATTENDED_STATUSES = {"present", "late"}


@dataclass
class ReportFilters:
    department_id: str | None = None
    course_id: str | None = None
    class_id: str | None = None
    student_id: str | None = None
    professor_id: str | None = None
    status: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
    search: str | None = None
    sort_by: str = "marked_at"
    sort_order: str = "desc"
    scope_professor_id: str | None = None


SORT_COLUMNS = {
    "marked_at": AttendanceRecord.marked_at,
    "status": AttendanceRecord.status,
    "method": AttendanceRecord.method,
    "student": User.full_name,
    "course": Course.code,
    "class": Class_.section,
    "session": AttendanceSession.starts_at,
}


def _options(query: Select) -> Select:
    return query.options(
        joinedload(AttendanceRecord.student).joinedload(Student.user),
        joinedload(AttendanceRecord.session).joinedload(AttendanceSession.class_).joinedload(Class_.course),
        joinedload(AttendanceRecord.session)
        .joinedload(AttendanceSession.class_)
        .joinedload(Class_.professor)
        .joinedload(Professor.user),
        joinedload(AttendanceRecord.session).joinedload(AttendanceSession.classroom),
    )


def records_query(db: Session, filters: ReportFilters) -> Select:
    query = (
        select(AttendanceRecord)
        .join(AttendanceRecord.session)
        .join(AttendanceSession.class_)
        .join(Class_.course)
        .join(AttendanceRecord.student)
        .join(Student.user)
        .outerjoin(Class_.professor)
        .outerjoin(AttendanceSession.classroom)
    )
    conditions = []
    if filters.department_id:
        conditions.append(Class_.department_id == filters.department_id)
    if filters.course_id:
        conditions.append(Class_.course_id == filters.course_id)
    if filters.class_id:
        conditions.append(AttendanceRecord.session_id.in_(select(AttendanceSession.id).where(AttendanceSession.class_id == filters.class_id)))
    if filters.student_id:
        conditions.append(AttendanceRecord.student_id == filters.student_id)
    if filters.professor_id:
        conditions.append(professor_class_filter(filters.professor_id))
    if filters.scope_professor_id:
        conditions.append(professor_class_filter(filters.scope_professor_id))
    if filters.status:
        conditions.append(AttendanceRecord.status == filters.status)
    if filters.from_date:
        conditions.append(AttendanceRecord.marked_at >= filters.from_date)
    if filters.to_date:
        conditions.append(AttendanceRecord.marked_at <= filters.to_date)
    if filters.search:
        pattern = f"%{filters.search}%"
        conditions.append(
            or_(
                User.full_name.ilike(pattern),
                Student.university_id.ilike(pattern),
                Course.name.ilike(pattern),
                Course.code.ilike(pattern),
            )
        )
    if conditions:
        query = query.where(*conditions)

    sort_column = SORT_COLUMNS.get(filters.sort_by, AttendanceRecord.marked_at)
    query = query.order_by(sort_column.desc() if filters.sort_order == "desc" else sort_column.asc())
    return _options(query)


def record_to_report(record: AttendanceRecord) -> ReportRecordOut:
    class_ = record.session.class_
    return ReportRecordOut(
        id=record.id,
        student_name=record.student.user.full_name,
        university_id=record.student.university_id,
        course_code=class_.course.code,
        course_name=class_.course.name,
        class_section=class_.section,
        professor_name=class_.professor.user.full_name if class_.professor and class_.professor.user else None,
        classroom_name=record.session.classroom.name if record.session.classroom else None,
        session_start=record.session.starts_at,
        status=cast(AttendanceStatus, record.status),
        method=cast(AttendanceMethod, record.method),
        marked_at=record.marked_at,
        location_status=record.location_status,
        face_status=record.face_status,
        is_manual=record.is_manual,
        correction_reason=record.correction_reason,
    )


def list_report_records(db: Session, filters: ReportFilters) -> list[ReportRecordOut]:
    return [record_to_report(record) for record in db.scalars(records_query(db, filters)).unique().all()]


def _group_key(record: AttendanceRecord, period: ReportPeriod) -> str:
    marked: datetime = record.marked_at
    if period == "daily":
        return marked.strftime("%Y-%m-%d")
    if period == "weekly":
        iso = marked.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if period == "monthly":
        return marked.strftime("%Y-%m")
    if period == "course":
        course = record.session.class_.course
        return f"{course.code} - {course.name}"
    if period == "student":
        return f"{record.student.user.full_name} ({record.student.university_id})"
    if period == "professor":
        professor = record.session.class_.professor
        return professor.user.full_name if professor and professor.user else "Unassigned"
    department = record.session.class_.department
    return department.name if department else "Unassigned"


def summary(db: Session, period: ReportPeriod, filters: ReportFilters) -> dict[str, Any]:
    query = records_query(db, filters)
    subquery = query.options().order_by(None).subquery()
    status_rows = db.execute(select(subquery.c.status, func.count()).group_by(subquery.c.status)).all()
    by_status = {str(status): int(count) for status, count in status_rows}

    records = list(db.scalars(query).unique().all())
    grouped: dict[str, dict[str, int | float]] = defaultdict(
        lambda: {"total": 0, "attended": 0, "attendance_rate": 0.0}
    )
    for record in records:
        group = grouped[_group_key(record, period)]
        group["total"] = int(group["total"]) + 1
        if record.status in ATTENDED_STATUSES:
            group["attended"] = int(group["attended"]) + 1

    groups: list[dict[str, object]] = []
    for key, values in sorted(grouped.items()):
        total = int(values["total"])
        attended = int(values["attended"])
        groups.append(
            {
                "group": key,
                "total": total,
                "attended": attended,
                "attendance_rate": round(attended / total, 4) if total else 0.0,
            }
        )

    total = sum(by_status.values())
    attended = sum(by_status.get(status, 0) for status in ATTENDED_STATUSES)
    return {
        "period": period,
        "total_records": total,
        "attendance_rate": round(attended / total, 4) if total else 0.0,
        "by_status": by_status,
        "groups": groups,
    }


def export_records(records: list[ReportRecordOut], format: ReportFormat) -> tuple[bytes, str, str]:
    timestamp = utcnow().strftime("%Y%m%d_%H%M%S")
    columns = [
        ("ID", "id"),
        ("Student", "student_name"),
        ("University ID", "university_id"),
        ("Course Code", "course_code"),
        ("Course", "course_name"),
        ("Section", "class_section"),
        ("Professor", "professor_name"),
        ("Classroom", "classroom_name"),
        ("Session Start", "session_start"),
        ("Status", "status"),
        ("Method", "method"),
        ("Marked At", "marked_at"),
        ("Location", "location_status"),
        ("Face", "face_status"),
        ("Manual", "is_manual"),
    ]

    if format == "xlsx":
        from openpyxl import Workbook
        from openpyxl.styles import Font

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Attendance"
        sheet.append([label for label, _ in columns])
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for record in records:
            sheet.append([str(getattr(record, field) or "") for _, field in columns])
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        buffer = BytesIO()
        workbook.save(buffer)
        return buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"attendance_report_{timestamp}.xlsx"

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle

    buffer = BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=landscape(A4), title="Attendance Report")
    styles = getSampleStyleSheet()
    elements: list[Any] = [
        Paragraph("University Attendance Report", styles["Heading1"]),
        Paragraph("<br/>", styles["Normal"]),
    ]
    data = [[label for label, _ in columns]]
    for record in records:
        data.append([str(getattr(record, field) or "") for _, field in columns])
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
            ]
        )
    )
    elements.append(table)
    document.build(elements)
    return buffer.getvalue(), "application/pdf", f"attendance_report_{timestamp}.pdf"
