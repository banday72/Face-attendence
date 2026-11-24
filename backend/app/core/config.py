from __future__ import annotations

import json
from functools import cached_property, lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "dev-only-jwt-secret-change-this-before-production"
DEFAULT_FACE_ENCRYPTION_KEY = "dev-only-face-encryption-key-change-this"
DEV_SECRET_MIN_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str = "sqlite:///./attendance.db"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    face_encryption_key: str = DEFAULT_FACE_ENCRYPTION_KEY
    face_match_threshold: float = 0.82
    face_model_name: str = "buffalo_l"
    face_liveness_min_frames: int = 3
    face_liveness_movement: float = 12.0
    face_retention_days: int = 365

    default_qr_validity_seconds: int = 45
    qr_refresh_seconds: int = 30
    default_late_minutes: int = 10
    allowed_classroom_radius_meters: float = 150.0

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    rate_limit_per_minute: int = 60
    environment: Literal["development", "test", "staging", "production"] = "development"
    biometric_consent_version: str = "1.0"
    force_seed: bool = False
    allow_dev_secrets: bool = False
    trusted_proxy_ips: str = ""

    @field_validator(
        "access_token_expire_minutes",
        "refresh_token_expire_days",
        "face_liveness_min_frames",
        "face_retention_days",
        "default_qr_validity_seconds",
        "qr_refresh_seconds",
        "rate_limit_per_minute",
    )
    @classmethod
    def positive_int(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("must be greater than zero")
        return value

    @field_validator("default_late_minutes")
    @classmethod
    def non_negative_int(cls, value: int) -> int:
        if value < 0:
            raise ValueError("must be zero or greater")
        return value

    @field_validator("face_match_threshold")
    @classmethod
    def valid_threshold(cls, value: float) -> float:
        if not 0.5 <= value <= 0.999:
            raise ValueError("must be between 0.5 and 0.999")
        return value

    @field_validator("face_liveness_movement", "allowed_classroom_radius_meters")
    @classmethod
    def positive_float(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("must be greater than zero")
        return value

    @model_validator(mode="after")
    def validate_runtime_secrets(self) -> Settings:
        allow_dev_defaults = (
            self.environment == "development"
            and self.allow_dev_secrets
            and self.jwt_secret == DEFAULT_JWT_SECRET
            and self.face_encryption_key == DEFAULT_FACE_ENCRYPTION_KEY
        )
        if self.environment != "test" and not allow_dev_defaults:
            if self.jwt_secret == DEFAULT_JWT_SECRET or len(self.jwt_secret) < DEV_SECRET_MIN_LENGTH:
                raise ValueError("JWT_SECRET must be a unique secret of at least 32 characters outside test")
            if self.face_encryption_key == DEFAULT_FACE_ENCRYPTION_KEY or len(self.face_encryption_key) < DEV_SECRET_MIN_LENGTH:
                raise ValueError(
                    "FACE_ENCRYPTION_KEY must be a unique secret of at least 32 characters outside test"
                )
        if self.environment == "production":
            if not self.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
                raise ValueError("production requires a PostgreSQL DATABASE_URL")
            if "*" in self.cors_origins_list:
                raise ValueError("CORS_ORIGINS cannot be '*' in production")
        return self

    @cached_property
    def cors_origins_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw.startswith("["):
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        return [item.strip() for item in raw.split(",") if item.strip()]

    @cached_property
    def trusted_hosts(self) -> list[str]:
        if "*" in self.cors_origins_list:
            return ["*"]
        hosts = {"localhost", "127.0.0.1"}
        if self.environment == "test":
            hosts.add("testserver")
        for origin in self.cors_origins_list:
            hostname = urlparse(origin if "://" in origin else f"http://{origin}").hostname
            if hostname:
                hosts.add(hostname)
        return sorted(hosts)

    @cached_property
    def trusted_proxy_ip_set(self) -> set[str]:
        raw = self.trusted_proxy_ips.strip()
        if not raw:
            return set()
        if raw.startswith("["):
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return {str(item).strip() for item in parsed if str(item).strip()}
        return {item.strip() for item in raw.split(",") if item.strip()}

    @property
    def is_testing(self) -> bool:
        return self.environment == "test"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
