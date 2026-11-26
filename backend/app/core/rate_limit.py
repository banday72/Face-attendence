from __future__ import annotations

from typing import cast

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.errors import error_response

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    headers_enabled=True,
    storage_uri=settings.rate_limit_storage_uri,
)

login_limit = limiter.limit("5/minute", methods=["POST"])
refresh_limit = limiter.limit("10/minute", methods=["POST"])
register_limit = limiter.limit("5/minute", methods=["POST"])
face_register_limit = limiter.limit("5/minute", methods=["POST"])
face_attendance_limit = limiter.limit("10/minute", methods=["POST"])
qr_checkin_limit = limiter.limit("30/minute", methods=["POST"])
general_write_limit = limiter.limit(f"{settings.rate_limit_per_minute}/minute", methods=["POST", "PATCH", "DELETE"])


async def rate_limit_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    rate_error = cast(RateLimitExceeded, exc)
    headers: dict[str, str] = {}
    retry_after = getattr(rate_error, "retry_after", None)
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return error_response(
        request,
        429,
        "rate_limited",
        "Too many requests. Please try again later.",
        {"limit": str(rate_error.detail)},
        headers,
    )
