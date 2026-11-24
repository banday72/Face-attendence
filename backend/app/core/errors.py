from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from typing import Any, cast

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

STATUS_TO_CODE = {
    400: "validation_error",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    413: "validation_error",
    422: "validation_error",
    429: "rate_limited",
    503: "service_unavailable",
}


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        self.headers = headers or {}


def request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body = {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "request_id": request_id(request),
        }
    }
    return JSONResponse(status_code=status_code, content=body, headers=headers)


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    error = cast(AppError, exc)
    return error_response(request, error.status_code, error.code, error.message, error.details, error.headers)


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    http_error = cast(HTTPException, exc)
    detail = http_error.detail
    code = STATUS_TO_CODE.get(http_error.status_code, "error")
    message = "Request failed"
    details: dict[str, Any] = {}
    if isinstance(detail, dict):
        code = str(detail.get("code", code))
        message = str(detail.get("message", message))
        details = detail.get("details", {}) if isinstance(detail.get("details"), dict) else {}
    elif isinstance(detail, str):
        message = detail
    return error_response(request, http_error.status_code, code, message, details, http_error.headers)


def _flatten_errors(errors: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    flattened = []
    for error in errors:
        location = ".".join(str(part) for part in error.get("loc", ()))
        flattened.append(
            {
                "field": location or "body",
                "message": str(error.get("msg", "Invalid value")),
                "type": str(error.get("type", "value_error")),
            }
        )
    return flattened


async def request_validation_handler(request: Request, exc: Exception) -> JSONResponse:
    validation_error = cast(RequestValidationError, exc)
    return error_response(
        request,
        422,
        "validation_error",
        "Request validation failed",
        {"errors": _flatten_errors(validation_error.errors())},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception for request %s", request_id(request), exc_info=exc)
    return error_response(
        request,
        500,
        "internal_error",
        "An unexpected error occurred",
    )
