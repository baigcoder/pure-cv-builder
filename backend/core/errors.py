"""Application errors and the handlers that turn them into safe JSON responses.

Every error response has the shape ``{"detail": str, "code": str, "request_id": str}``
plus optional ``fields`` for validation problems. Internal details (tracebacks,
renderer output, user CV content) are logged server-side and never returned.
"""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger(__name__)


class AppError(Exception):
    """An error whose message is safe to show to end users."""

    status_code = 400
    code = "bad_request"

    def __init__(self, detail: str, *, fields: dict[str, str] | None = None):
        super().__init__(detail)
        self.detail = detail
        self.fields = fields or {}


class RenderValidationError(AppError):
    """RenderCV rejected the CV content (e.g. an invalid date or URL)."""

    status_code = 422
    code = "render_validation_error"


class RenderFailedError(AppError):
    """Rendering failed for a reason the user cannot fix."""

    status_code = 500
    code = "render_failed"


class RenderTimeoutError(AppError):
    status_code = 504
    code = "render_timeout"


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "service_unavailable"


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "-")


def _payload(request: Request, detail: str, code: str, fields: dict[str, str] | None = None) -> dict:
    body = {"detail": detail, "code": code, "request_id": _request_id(request)}
    if fields:
        body["fields"] = fields
    return body


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.error("%s: %s", exc.code, exc.detail, extra={"request_id": _request_id(request)})
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(request, exc.detail, exc.code, exc.fields),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(request, str(exc.detail), f"http_{exc.status_code}"),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for error in exc.errors():
            location = ".".join(str(part) for part in error.get("loc", ()) if part != "body")
            fields[location or "body"] = error.get("msg", "Invalid value")
        return JSONResponse(
            status_code=422,
            content=_payload(request, "Some fields are invalid.", "validation_error", fields),
        )

    @app.exception_handler(RateLimitExceeded)
    async def handle_rate_limit(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content=_payload(request, "Too many requests. Please slow down and try again shortly.", "rate_limited"),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", extra={"request_id": _request_id(request)})
        return JSONResponse(
            status_code=500,
            content=_payload(request, "Something went wrong on our side. Please try again.", "internal_error"),
        )
