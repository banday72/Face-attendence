from __future__ import annotations

import asyncio
import base64
import http.client
import json
import logging
import sys
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from alembic.config import Config as AlembicConfig
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi.errors import RateLimitExceeded
from sqlalchemy import inspect, text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from alembic import command as alembic_command
from app.api.v1.endpoints import health
from app.api.v1.router import api_router
from app.core.config import Settings, settings
from app.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    request_validation_handler,
    unhandled_exception_handler,
)
from app.core.rate_limit import limiter, rate_limit_exception_handler
from app.db.session import SessionLocal, engine
from app.services import report_feature_service
from app.services.face_service import purge_expired_embeddings


def _vercel_proxy_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    module = sys.modules["vercel_runtime.vc_init"]
    payload = json.loads(event["body"])
    header_pairs = module.normalize_event_header_pairs(payload.get("headers", {}))
    header_names = {key.lower() for key, _ in header_pairs}
    body = payload.get("body")
    if payload.get("encoding") == "base64":
        body = base64.b64decode(body)
    elif isinstance(body, str):
        body = body.encode()
    connection = http.client.HTTPConnection("127.0.0.1", module.http_port)
    try:
        connection.putrequest(
            payload["method"],
            payload["path"],
            skip_host="host" in header_names,
            skip_accept_encoding="accept-encoding" in header_names,
        )
        for key, value in header_pairs:
            connection.putheader(key, value)
        if (
            "content-length" not in header_names
            and "transfer-encoding" not in header_names
        ):
            connection.putheader("content-length", str(len(body or b"")))
        connection.endheaders(body)
        response = connection.getresponse()
        response_body = response.read()
        result: dict[str, Any] = {
            "statusCode": response.status,
            "headers": module.format_headers(response.headers),
        }
        try:
            result["body"] = response_body.decode()
        except UnicodeDecodeError:
            result["body"] = base64.b64encode(response_body).decode()
            result["encoding"] = "base64"
        return result
    finally:
        connection.close()


_vc_init = sys.modules.get("vercel_runtime.vc_init")
if _vc_init is not None and not hasattr(_vc_init, "vc_handler"):
    _vc_init.vc_handler = _vercel_proxy_handler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("attendance")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request.state.request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        logger.info(
            "%s %s %s %.2fms rid=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request.state.request_id,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, production: bool = False) -> None:
        super().__init__(app)
        self.production = production

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=(self)"
        if self.production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


def run_database_migrations() -> None:
    alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    alembic_config = AlembicConfig(str(alembic_ini))
    alembic_config.set_main_option("script_location", str(alembic_ini.parent / "alembic"))
    alembic_command.upgrade(alembic_config, "head")


def verify_database_readiness() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        table_names = set(inspect(connection).get_table_names())
        if "alembic_version" not in table_names:
            raise RuntimeError("Database has not been migrated. Check DATABASE_URL and startup migration logs.")


async def face_retention_task() -> None:
    while True:
        await asyncio.sleep(24 * 60 * 60)
        try:
            with SessionLocal() as db:
                deleted = purge_expired_embeddings(db, settings.face_retention_days)
                db.commit()
            if deleted:
                logger.info("Purged %d expired face embeddings", deleted)
        except Exception:
            logger.exception("Face retention cleanup failed")


async def scheduled_export_task() -> None:
    while True:
        await asyncio.sleep(60)
        try:
            with SessionLocal() as db:
                processed = report_feature_service.run_due_scheduled_exports(db)
                db.commit()
            if processed:
                logger.info("Processed %d due scheduled exports", processed)
        except Exception:
            logger.exception("Scheduled export runner failed")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    retention_task: asyncio.Task[None] | None = None
    scheduled_export_runner: asyncio.Task[None] | None = None
    if not settings.is_testing:
        run_database_migrations()
        verify_database_readiness()
        if settings.face_retention_days > 0:
            retention_task = asyncio.create_task(face_retention_task())
        scheduled_export_runner = asyncio.create_task(scheduled_export_task())
    yield
    for task in (retention_task, scheduled_export_runner):
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


def create_app(config: Settings | None = None) -> FastAPI:
    active = config or settings
    application = FastAPI(
        title="Smart University Attendance API",
        version="1.0.0",
        description="Role-based attendance management with QR, geolocation, and encrypted face verification.",
        lifespan=lifespan,
        openapi_tags=[
            {"name": "auth", "description": "Registration, login, and token rotation."},
            {"name": "admin", "description": "Administrative management of users and academic data."},
            {"name": "academic", "description": "Shared academic reference data."},
            {"name": "sessions", "description": "Attendance sessions and rotating QR tokens."},
            {"name": "attendance", "description": "Check-ins, rosters, corrections, and dashboards."},
            {"name": "face", "description": "Consent-based biometric registration and deletion."},
            {"name": "reports", "description": "Aggregated analytics and exports."},
            {"name": "health", "description": "Liveness and readiness probes."},
        ],
    )

    application.add_middleware(SecurityHeadersMiddleware, production=active.environment == "production")
    application.add_middleware(RequestContextMiddleware)
    application.add_middleware(TrustedHostMiddleware, allowed_hosts=active.trusted_hosts)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=active.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    application.add_exception_handler(AppError, app_error_handler)
    application.add_exception_handler(HTTPException, http_exception_handler)
    application.add_exception_handler(RequestValidationError, request_validation_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)

    application.add_exception_handler(RateLimitExceeded, rate_limit_exception_handler)
    if not active.is_testing:
        application.state.limiter = limiter

    application.include_router(api_router)
    application.add_api_route("/health", health.health, methods=["GET"], include_in_schema=False)
    application.add_api_route("/ready", health.ready, methods=["GET"], include_in_schema=False)
    return application


app = create_app()
