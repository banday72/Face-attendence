from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status

from app.core.audit import write_audit_log
from app.core.config import settings
from app.core.deps import DB_Dependency, require_student, student_profile
from app.core.errors import AppError
from app.core.rate_limit import face_register_limit
from app.models import User
from app.schemas.face import FaceRegisterIn, FaceRegisterOut, FaceStatusOut
from app.services import face_service
from app.utils.uuid import utcnow

router = APIRouter(prefix="/face", tags=["face"], dependencies=[Depends(require_student)])


@router.get("/status", response_model=FaceStatusOut)
def face_status(db: DB_Dependency, user: User = Depends(require_student)) -> FaceStatusOut:
    student = student_profile(db, user)
    consent = student.consent
    count = face_service.active_embedding_count(db, student)
    return FaceStatusOut(
        is_registered=count > 0,
        embedding_count=count,
        model_name=settings.face_model_name,
        consent_version=consent.consent_version if consent else None,
        consented_at=consent.consented_at if consent else None,
        requires_new_consent=consent is None
        or not consent.is_active
        or consent.consent_version != settings.biometric_consent_version,
        liveness_min_frames=settings.face_liveness_min_frames,
    )


@router.post("/register", response_model=FaceRegisterOut, status_code=status.HTTP_201_CREATED)
@face_register_limit
def register_face(
    payload: FaceRegisterIn,
    request: Request,
    response: Response,
    db: DB_Dependency,
    user: User = Depends(require_student),
) -> FaceRegisterOut:
    if payload.consent_version != settings.biometric_consent_version:
        raise AppError(
            422,
            "validation_error",
            "Biometric consent version is outdated",
            {"expected_version": settings.biometric_consent_version},
        )
    student = student_profile(db, user)
    analysis = face_service.analyze_client_frames(payload.descriptors, payload.centers)
    count = face_service.register_embeddings(db, student, analysis)
    face_service.set_consent(db, student, payload.consent_version)
    write_audit_log(
        db,
        action="face.register",
        entity_type="student",
        entity_id=student.id,
        actor=user,
        after={"embedding_count": count, "consent_version": payload.consent_version, "model": settings.face_model_name},
        reason="Biometric registration with explicit consent",
        request=request,
    )
    db.commit()
    return FaceRegisterOut(
        embedding_count=count,
        model_name=settings.face_model_name,
        consent_version=payload.consent_version,
        similarity_threshold=settings.face_match_threshold,
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_face(request: Request, db: DB_Dependency, user: User = Depends(require_student)) -> Response:
    student = student_profile(db, user)
    face_service.delete_biometrics(db, student)
    write_audit_log(
        db,
        action="face.delete",
        entity_type="student",
        entity_id=student.id,
        actor=user,
        after={"biometrics_deleted": True, "deleted_at": utcnow().isoformat()},
        reason="Student requested biometric data deletion",
        request=request,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
