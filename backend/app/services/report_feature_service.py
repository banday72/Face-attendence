from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.errors import AppError
from app.models import Professor, ScheduledExportRun, ScheduledReportExport, User
from app.schemas.reports import ReportFilterIn, ReportFormat
from app.utils.uuid import new_uuid, utcnow

logger = logging.getLogger("attendance")


def _add_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def calculate_next_run_at(frequency: str, now: datetime | None = None) -> datetime:
    current = now or utcnow()
    if frequency == "daily":
        return current + timedelta(days=1)
    if frequency == "monthly":
        return _add_months(current, 1)
    return current + timedelta(days=7)


def parse_filter_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def normalize_filters(filters: ReportFilterIn | dict[str, Any] | None) -> ReportFilterIn:
    if isinstance(filters, ReportFilterIn):
        return filters
    return ReportFilterIn.model_validate(filters or {})


def build_report_filters(
    filters: ReportFilterIn | dict[str, Any] | None = None,
    scope_professor_id: str | None = None,
) -> Any:
    from app.services import report_service

    model = normalize_filters(filters)
    return report_service.ReportFilters(
        department_id=model.department_id,
        course_id=model.course_id,
        class_id=model.class_id,
        professor_id=model.professor_id,
        status=model.status,
        from_date=parse_filter_datetime(model.from_date),
        to_date=parse_filter_datetime(model.to_date),
        scope_professor_id=scope_professor_id,
    )


def generate_export(
    db: Session,
    filters: ReportFilterIn | dict[str, Any] | None = None,
    format: ReportFormat = "xlsx",
    scope_professor_id: str | None = None,
) -> tuple[bytes, str, str]:
    from app.services import report_service

    model = normalize_filters(filters)
    query = report_service.records_query(db, build_report_filters(model, scope_professor_id))
    records = [report_service.record_to_report(record) for record in db.scalars(query).unique().all()]
    if model.method:
        records = [record for record in records if record.method == model.method]
    return report_service.export_records(records, format)


def run_due_scheduled_exports(db: Session, now: datetime | None = None, limit: int = 20) -> int:
    current = now or utcnow()
    schedules = list(
        db.scalars(
            select(ScheduledReportExport)
            .where(
                ScheduledReportExport.is_active.is_(True),
                ScheduledReportExport.next_run_at <= current,
            )
            .order_by(ScheduledReportExport.next_run_at.asc(), ScheduledReportExport.id.asc())
            .limit(max(limit, 0))
        ).all()
    )
    processed = 0
    for schedule in schedules:
        processed += 1
        error: str | None = None
        try:
            owner = db.get(User, schedule.user_id)
            if owner is None:
                raise RuntimeError("Scheduled export owner not found")
            scope_professor_id = None
            if owner.role == "professor":
                scope_professor_id = db.scalar(select(Professor.id).where(Professor.user_id == owner.id))
            content, content_type, filename = generate_export(
                db, schedule.filters, schedule.format, scope_professor_id
            )
            run_status = "ready"
        except (
            AppError,
            AttributeError,
            ImportError,
            KeyError,
            OSError,
            RuntimeError,
            TypeError,
            ValueError,
        ) as exc:
            content = b""
            content_type = "text/plain"
            filename = f"scheduled_export_failed_{current.strftime('%Y%m%d_%H%M%S')}.txt"
            run_status = "failed"
            error = str(exc)[:500]

        try:
            with db.begin_nested():
                run = ScheduledExportRun(
                    id=new_uuid(),
                    schedule_id=schedule.id,
                    user_id=schedule.user_id,
                    filename=filename,
                    content_type=content_type,
                    content=content,
                    size_bytes=len(content),
                    status=run_status,
                    error=error,
                    created_at=current,
                    updated_at=current,
                )
                db.add(run)
                schedule.last_run_at = current
                schedule.next_run_at = calculate_next_run_at(schedule.frequency, current)
                schedule.updated_at = current
                db.flush()
                write_audit_log(
                    db,
                    action="report.scheduled_run",
                    entity_type="scheduled_export_run",
                    entity_id=run.id,
                    actor_id=schedule.user_id,
                    after={
                        "schedule_id": schedule.id,
                        "format": schedule.format,
                        "status": run_status,
                        "size_bytes": run.size_bytes,
                    },
                )
        except SQLAlchemyError:
            logger.exception("Failed to persist scheduled export run for schedule %s", schedule.id)
    return processed
