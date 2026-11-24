from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.v1.endpoints._helpers import pagination, report_filters
from app.core.deps import DB_Dependency, professor_profile, require_professor_or_admin
from app.models import User
from app.schemas.common import Page, paginate
from app.schemas.reports import ReportPeriod, ReportRecordOut, ReportSummaryOut
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[Depends(require_professor_or_admin)])


def _scope_professor_id(db: Session, user: User) -> str | None:
    return professor_profile(db, user).id if user.role == "professor" else None


@router.get("/summary", response_model=ReportSummaryOut)
def summary(
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
    period: ReportPeriod = Query("daily"),
    department_id: str | None = None,
    course_id: str | None = None,
    class_id: str | None = None,
    student_id: str | None = None,
    professor_id: str | None = None,
    status: str | None = Query(None, pattern="^(present|late|absent|excused)$"),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    search: str | None = Query(None, max_length=100),
) -> ReportSummaryOut:
    filters = report_filters(
        department_id=department_id,
        course_id=course_id,
        class_id=class_id,
        student_id=student_id,
        professor_id=professor_id,
        status=status,
        from_date=from_date,
        to_date=to_date,
        search=search,
        scope_professor_id=_scope_professor_id(db, user),
    )
    return ReportSummaryOut.model_validate(report_service.summary(db, period, filters))


@router.get("/records", response_model=Page[ReportRecordOut])
def records(
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    department_id: str | None = None,
    course_id: str | None = None,
    class_id: str | None = None,
    student_id: str | None = None,
    professor_id: str | None = None,
    status: str | None = Query(None, pattern="^(present|late|absent|excused)$"),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    search: str | None = Query(None, max_length=100),
    sort_by: Literal["marked_at", "status", "method", "student", "course", "class", "session"] = "marked_at",
    sort_order: Literal["asc", "desc"] = "desc",
) -> Page[ReportRecordOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    filters = report_filters(
        department_id=department_id,
        course_id=course_id,
        class_id=class_id,
        student_id=student_id,
        professor_id=professor_id,
        status=status,
        from_date=from_date,
        to_date=to_date,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        scope_professor_id=_scope_professor_id(db, user),
    )
    result = paginate(db, report_service.records_query(db, filters), params)
    return Page[ReportRecordOut](
        items=[report_service.record_to_report(record) for record in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/export")
def export(
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    department_id: str | None = None,
    course_id: str | None = None,
    class_id: str | None = None,
    student_id: str | None = None,
    professor_id: str | None = None,
    status: str | None = Query(None, pattern="^(present|late|absent|excused)$"),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    search: str | None = Query(None, max_length=100),
    sort_by: Literal["marked_at", "status", "method", "student", "course", "class", "session"] = "marked_at",
    sort_order: Literal["asc", "desc"] = "desc",
):
    filters = report_filters(
        department_id=department_id,
        course_id=course_id,
        class_id=class_id,
        student_id=student_id,
        professor_id=professor_id,
        status=status,
        from_date=from_date,
        to_date=to_date,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        scope_professor_id=_scope_professor_id(db, user),
    )
    rows = report_service.list_report_records(db, filters)
    content, media_type, filename = report_service.export_records(rows, format)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
