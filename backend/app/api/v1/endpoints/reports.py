from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.endpoints._helpers import pagination, report_filters
from app.core.audit import write_audit_log
from app.core.deps import DB_Dependency, professor_profile, require_professor_or_admin
from app.core.errors import AppError
from app.models import ReportPreset, ScheduledExportRun, ScheduledReportExport, User
from app.schemas.common import Page, paginate
from app.schemas.reports import (
    ReportPeriod,
    ReportPresetIn,
    ReportPresetOut,
    ReportPresetUpdate,
    ReportRecordOut,
    ReportSummaryOut,
    ScheduledExportIn,
    ScheduledExportOut,
    ScheduledExportRunOut,
    ScheduledExportUpdate,
)
from app.services import report_feature_service, report_service
from app.utils.uuid import new_uuid, utcnow

router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[Depends(require_professor_or_admin)])


def _scope_professor_id(db: Session, user: User) -> str | None:
    return professor_profile(db, user).id if user.role == "professor" else None


def _get_owned_preset(db: Session, preset_id: str, user_id: str) -> ReportPreset:
    preset = db.get(ReportPreset, preset_id)
    if preset is None or preset.user_id != user_id:
        raise AppError(404, "not_found", "Report preset not found")
    return preset


def _get_owned_schedule(db: Session, schedule_id: str, user_id: str) -> ScheduledReportExport:
    schedule = db.get(ScheduledReportExport, schedule_id)
    if schedule is None or schedule.user_id != user_id:
        raise AppError(404, "not_found", "Scheduled export not found")
    return schedule


def _preset_snapshot(preset: ReportPreset) -> dict[str, object]:
    return {
        "name": preset.name,
        "report_type": preset.report_type,
        "filters": preset.filters,
        "is_default": preset.is_default,
    }


def _schedule_snapshot(schedule: ScheduledReportExport) -> dict[str, object]:
    return {
        "name": schedule.name,
        "format": schedule.format,
        "frequency": schedule.frequency,
        "filters": schedule.filters,
        "next_run_at": schedule.next_run_at.isoformat(),
        "last_run_at": schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        "is_active": schedule.is_active,
    }


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


@router.get("/presets", response_model=list[ReportPresetOut])
def list_presets(db: DB_Dependency, user: User = Depends(require_professor_or_admin)) -> list[ReportPreset]:
    return list(
        db.scalars(
            select(ReportPreset)
            .where(ReportPreset.user_id == user.id)
            .order_by(ReportPreset.created_at.desc())
        ).all()
    )


@router.post("/presets", response_model=ReportPresetOut, status_code=status.HTTP_201_CREATED)
def create_preset(
    payload: ReportPresetIn,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> ReportPreset:
    duplicate = db.scalar(
        select(ReportPreset.id).where(ReportPreset.user_id == user.id, ReportPreset.name == payload.name)
    )
    if duplicate is not None:
        raise AppError(409, "conflict", "A report preset with this name already exists")

    filters = payload.filters.model_dump(mode="json", exclude_none=True)
    preset = ReportPreset(
        id=new_uuid(),
        user_id=user.id,
        name=payload.name,
        report_type=payload.report_type,
        filters=filters,
        is_default=payload.is_default,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(preset)
    try:
        write_audit_log(
            db,
            action="report.preset_create",
            entity_type="report_preset",
            entity_id=preset.id,
            actor=user,
            after={"name": preset.name, "report_type": preset.report_type, "filters": filters},
            request=request,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "A report preset with this name already exists") from exc
    return preset


@router.patch("/presets/{preset_id}", response_model=ReportPresetOut)
def update_preset(
    preset_id: str,
    payload: ReportPresetUpdate,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> ReportPreset:
    preset = _get_owned_preset(db, preset_id, user.id)
    before = _preset_snapshot(preset)
    updates = payload.model_dump(exclude_unset=True)
    if "filters" in updates and payload.filters is not None:
        updates["filters"] = payload.filters.model_dump(mode="json", exclude_none=True)
    now = utcnow()
    cleared_default_ids: list[str] = []
    if updates.get("is_default") is True:
        others = db.scalars(
            select(ReportPreset).where(
                ReportPreset.user_id == user.id,
                ReportPreset.id != preset.id,
                ReportPreset.is_default.is_(True),
            )
        ).all()
        for other in others:
            other.is_default = False
            other.updated_at = now
            cleared_default_ids.append(other.id)
    for key, value in updates.items():
        setattr(preset, key, value)
    preset.updated_at = now
    write_audit_log(
        db,
        action="report.preset_update",
        entity_type="report_preset",
        entity_id=preset.id,
        actor=user,
        before=before,
        after={**_preset_snapshot(preset), "cleared_default_ids": cleared_default_ids},
        request=request,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "A report preset with this name already exists") from exc
    return preset


@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preset(
    preset_id: str,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> None:
    preset = _get_owned_preset(db, preset_id, user.id)
    before = _preset_snapshot(preset)
    write_audit_log(
        db,
        action="report.preset_delete",
        entity_type="report_preset",
        entity_id=preset.id,
        actor=user,
        before=before,
        request=request,
    )
    db.delete(preset)
    db.commit()


@router.get("/scheduled-exports", response_model=list[ScheduledExportOut])
def list_scheduled_exports(
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> list[ScheduledReportExport]:
    return list(
        db.scalars(
            select(ScheduledReportExport)
            .where(ScheduledReportExport.user_id == user.id)
            .order_by(ScheduledReportExport.created_at.desc())
        ).all()
    )


@router.post("/scheduled-exports", response_model=ScheduledExportOut, status_code=status.HTTP_201_CREATED)
def create_scheduled_export(
    payload: ScheduledExportIn,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> ScheduledReportExport:
    filters = payload.filters.model_dump(mode="json", exclude_none=True)
    now = utcnow()
    schedule = ScheduledReportExport(
        id=new_uuid(),
        user_id=user.id,
        name=payload.name,
        format=payload.format,
        frequency=payload.frequency,
        filters=filters,
        next_run_at=report_feature_service.calculate_next_run_at(payload.frequency, now),
        last_run_at=None,
        is_active=payload.is_active,
        created_at=now,
        updated_at=now,
    )
    db.add(schedule)
    write_audit_log(
        db,
        action="report.scheduled_create",
        entity_type="scheduled_report_export",
        entity_id=schedule.id,
        actor=user,
        after=_schedule_snapshot(schedule),
        request=request,
    )
    db.commit()
    return schedule


@router.get("/scheduled-exports/runs", response_model=Page[ScheduledExportRunOut])
def list_scheduled_exports_runs(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    schedule_id: str | None = None,
    user: User = Depends(require_professor_or_admin),
) -> Page[ScheduledExportRunOut]:
    params = pagination(page, page_size)
    query = select(ScheduledExportRun).where(ScheduledExportRun.user_id == user.id)
    if schedule_id:
        query = query.where(ScheduledExportRun.schedule_id == schedule_id)
    result = paginate(db, query.order_by(ScheduledExportRun.created_at.desc()), params)
    return Page[ScheduledExportRunOut](
        items=[ScheduledExportRunOut.model_validate(item) for item in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/scheduled-exports/runs/{run_id}/download")
def download_scheduled_export_run(
    run_id: str,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> Response:
    run = db.get(ScheduledExportRun, run_id)
    if run is None or run.user_id != user.id:
        raise AppError(404, "not_found", "Scheduled export run not found")
    return Response(
        content=run.content,
        media_type=run.content_type,
        headers={"Content-Disposition": f'attachment; filename="{run.filename}"'},
    )


@router.post("/scheduled-exports/{schedule_id}/run", response_model=ScheduledExportRunOut)
def run_scheduled_export(
    schedule_id: str,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> ScheduledExportRun:
    schedule = _get_owned_schedule(db, schedule_id, user.id)
    now = utcnow()
    error: str | None = None
    try:
        content, content_type, filename = report_feature_service.generate_export(
            db,
            schedule.filters,
            schedule.format,
            _scope_professor_id(db, user),
        )
        run_status = "ready"
    except (AppError, AttributeError, ImportError, KeyError, OSError, RuntimeError, TypeError, ValueError) as exc:
        content = b""
        content_type = "text/plain"
        filename = f"scheduled_export_failed_{now.strftime('%Y%m%d_%H%M%S')}.txt"
        run_status = "failed"
        error = str(exc)[:500]

    run = ScheduledExportRun(
        id=new_uuid(),
        schedule_id=schedule.id,
        user_id=user.id,
        filename=filename,
        content_type=content_type,
        content=content,
        size_bytes=len(content),
        status=run_status,
        error=error,
        created_at=now,
        updated_at=now,
    )
    schedule.last_run_at = now
    db.add(run)
    write_audit_log(
        db,
        action="report.scheduled_run",
        entity_type="scheduled_export_run",
        entity_id=run.id,
        actor=user,
        after={
            "schedule_id": schedule.id,
            "format": schedule.format,
            "status": run_status,
            "size_bytes": run.size_bytes,
        },
        request=request,
    )
    db.commit()
    if run_status == "failed":
        raise AppError(503, "service_unavailable", "Scheduled export generation failed")
    return run


@router.patch("/scheduled-exports/{schedule_id}", response_model=ScheduledExportOut)
def update_scheduled_export(
    schedule_id: str,
    payload: ScheduledExportUpdate,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> ScheduledReportExport:
    schedule = _get_owned_schedule(db, schedule_id, user.id)
    before = _schedule_snapshot(schedule)
    updates = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
    if "filters" in updates and payload.filters is not None:
        updates["filters"] = payload.filters.model_dump(mode="json", exclude_none=True)
    for key, value in updates.items():
        setattr(schedule, key, value)
    schedule.next_run_at = report_feature_service.calculate_next_run_at(schedule.frequency, utcnow())
    write_audit_log(
        db,
        action="report.scheduled_update",
        entity_type="scheduled_report_export",
        entity_id=schedule.id,
        actor=user,
        before=before,
        after=_schedule_snapshot(schedule),
        request=request,
    )
    db.commit()
    return schedule


@router.delete("/scheduled-exports/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scheduled_export(
    schedule_id: str,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
) -> None:
    schedule = _get_owned_schedule(db, schedule_id, user.id)
    before = _schedule_snapshot(schedule)
    write_audit_log(
        db,
        action="report.scheduled_delete",
        entity_type="scheduled_report_export",
        entity_id=schedule.id,
        actor=user,
        before=before,
        request=request,
    )
    db.delete(schedule)
    db.commit()
