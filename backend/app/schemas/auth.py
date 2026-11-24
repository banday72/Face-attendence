from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field, field_validator

from app.schemas.common import ORMModel, StrictModel

Role = Literal["admin", "professor", "student"]


def validate_password(value: str) -> str:
    password_bytes = len(value.encode("utf-8"))
    if password_bytes < 8 or password_bytes > 72:
        raise ValueError("password must be between 8 and 72 bytes")
    if not re.search(r"[A-Z]", value) or not re.search(r"[a-z]", value) or not re.search(r"\d", value):
        raise ValueError("password must contain uppercase, lowercase, and numeric characters")
    return value


class RegisterIn(StrictModel):
    email: EmailStr
    password: str
    full_name: str = Field(min_length=2, max_length=150)
    university_id: str = Field(min_length=3, max_length=50)
    program: str | None = Field(default=None, max_length=120)
    year_level: int | None = Field(default=None, ge=1, le=8)

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password(value)


class LoginIn(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class AccessTokenOut(StrictModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class UserOut(ORMModel):
    id: str
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool
    phone: str | None
    created_at: datetime


class MeOut(UserOut):
    university_id: str | None = None
    program: str | None = None
    year_level: int | None = None
    employee_id: str | None = None
    department_id: str | None = None
    department_name: str | None = None


class AuthOut(AccessTokenOut):
    user: MeOut
