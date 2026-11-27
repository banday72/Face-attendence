from __future__ import annotations

from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.schemas.auth import Role
from app.schemas.common import ORMModel, StrictModel


class ProfileOut(ORMModel):
    id: str
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool
    phone: str | None
    created_at: datetime
    university_id: str | None = None
    employee_id: str | None = None
    department_id: str | None = None
    department_name: str | None = None
    program: str | None = None
    year_level: int | None = None
    title: str | None = None
    office: str | None = None


class ProfileUpdateIn(StrictModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    program: str | None = Field(default=None, max_length=120)
    year_level: int | None = Field(default=None, ge=1, le=8)

    @field_validator("full_name", "phone", "program")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field cannot be blank")
        return cleaned


class ConsentOut(StrictModel):
    id: str | None = None
    student_id: str | None = None
    consent_version: str | None = None
    current_version: str
    consented_at: datetime | None = None
    revoked_at: datetime | None = None
    is_active: bool = False
    requires_new_consent: bool = True


class ConsentAcceptIn(StrictModel):
    consent_version: str | None = Field(default=None, max_length=20)


class FaceEmbeddingDataOut(StrictModel):
    id: str
    vector: list[float]
    model_name: str
    vector_version: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FaceDataExportOut(StrictModel):
    export_id: str
    student_id: str
    university_id: str
    exported_at: datetime
    embedding_count: int
    model_name: str
    vector_version: str
    descriptors: list[list[float]]
    embeddings: list[FaceEmbeddingDataOut]
    consent: ConsentOut | None = None
    consent_metadata: ConsentOut | None = None
