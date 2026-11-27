from __future__ import annotations

from datetime import datetime
from typing import cast

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.v1.endpoints._helpers import pagination
from app.core.deps import (
    DB_Dependency,
    require_professor_or_admin,
    require_student,
    student_profile,
)
from app.models import User
from app.schemas.common import Page
from app.schemas.corrections import (
    CorrectionRequestCreate,
    CorrectionRequestOut,
    CorrectionReviewIn,
    CorrectionStatus,
)
from app.services import correction_service

router = APIRouter(tags=["corrections"])


@router.post(
    "/attendance/correction-requests",
    response_model=CorrectionRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_correction_request(
    payload: CorrectionRequestCreate,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_student),
) -> CorrectionRequestOut:
    student = student_profile(db, user)
    correction = correction_service.create_request(
        db,
        student=student,
        actor=user,
        payload=payload,
        request=request,
    )
    response = correction_service.serialize_request(correction)
    db.commit()
    return response


@router.get("/attendance/correction-requests/me", response_model=Page[CorrectionRequestOut])
def my_correction_requests(
    db: DB_Dependency,
    user: User = Depends(require_student),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None, pattern="^(pending|approved|rejected)$"),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
) -> Page[CorrectionRequestOut]:
    params = pagination(page, page_size, "created_at", "desc")
    student = student_profile(db, user)
    return correction_service.list_student_requests(
        db,
        student=student,
        status=cast(CorrectionStatus | None, status),
        from_date=from_date,
        to_date=to_date,
        params=params,
    )


@router.get("/attendance/correction-requests", response_model=Page[CorrectionRequestOut])
def correction_request_queue(
    db: DB_Dependency,
    user: User = Depends(require_professor_or_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None, pattern="^(pending|approved|rejected)$"),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    class_id: str | None = None,
) -> Page[CorrectionRequestOut]:
    params = pagination(page, page_size, "created_at", "desc")
    return correction_service.list_review_requests(
        db,
        actor=user,
        status=cast(CorrectionStatus | None, status),
        from_date=from_date,
        to_date=to_date,
        class_id=class_id,
        params=params,
    )


@router.post("/attendance/correction-requests/{request_id}/review", response_model=CorrectionRequestOut)
def review_correction_request(
    request_id: str,
    payload: CorrectionReviewIn,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_professor_or_admin),
) -> CorrectionRequestOut:
    correction = correction_service.review_request(
        db,
        correction_id=request_id,
        actor=actor,
        payload=payload,
        request=request,
    )
    response = correction_service.serialize_request(correction)
    db.commit()
    return response


@router.post("/attendance/correction-requests/{request_id}/withdraw")
def withdraw_correction_request(
    request_id: str,
    request: Request,
    db: DB_Dependency,
    user: User = Depends(require_student),
) -> dict[str, str]:
    student = student_profile(db, user)
    correction_service.withdraw_request(
        db,
        correction_id=request_id,
        student=student,
        actor=user,
        request=request,
    )
    db.commit()
    return {"status": "withdrawn"}
