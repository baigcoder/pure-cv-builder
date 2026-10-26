"""
FastAPI backend for ApplyForge (RenderCV web application).

Routes live in ``api/routes``; request/response models in ``schemas``;
settings, rate limiting, and error handling in ``core``.
"""

import logging
import time
import uuid
from contextlib import asynccontextmanager

from core.config import get_settings

settings = get_settings()


class RequestIdFilter(logging.Filter):
    """Attach a default request_id so third-party logs do not break formatting."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] %(message)s",
)
for handler in logging.getLogger().handlers:
    handler.addFilter(RequestIdFilter())

logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from core.errors import register_error_handlers
from core.limiter import DEFAULT_LIMIT, limiter
from db.migrate import upgrade_to_head
from db.session import engine
from services.render_engine import shutdown_render_engine

API_VERSION = "1.2.0"


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.db_auto_migrate:
        upgrade_to_head(engine)
    yield
    shutdown_render_engine()


app = FastAPI(
    title="ApplyForge API",
    description="Generate professional CVs and cover letters from structured data",
    version=API_VERSION,
    lifespan=lifespan,
)
app.state.limiter = limiter
register_error_handlers(app)


# CORS is registered before the @app.middleware decorators so it is the
# outermost layer and answers OPTIONS preflight requests itself.
logger.info("CORS allowed origins: %s; regex: %s", settings.cors_origins, settings.cors_origin_regex)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    # No cookie/session auth exists yet. Keep credentials off so the broad
    # preview-origin regex cannot be used for credentialed cross-site calls.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time", "Content-Disposition"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Assign a request id and log each request with its timing."""
    request_id = request.headers.get("X-Request-ID", "")[:32] or uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    start_time = time.perf_counter()

    response = await call_next(request)

    process_time = time.perf_counter() - start_time
    logger.info(
        "%s %s -> %s in %.3fs",
        request.method,
        request.url.path,
        response.status_code,
        process_time,
        extra={"request_id": request_id},
    )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{process_time:.4f}"
    return response


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health_check():
    """Liveness probe for Railway."""
    return {"status": "healthy"}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Avoid noisy 404 logs when browsers request a backend favicon."""
    return Response(status_code=204)


@app.get("/")
async def root():
    return {"status": "ok", "message": "ApplyForge API is running"}


@app.get("/api/health")
@limiter.limit(DEFAULT_LIMIT)
async def api_health_check(request: Request):
    return {
        "status": "healthy",
        "version": API_VERSION,
        "environment": settings.environment,
        "accounts_enabled": settings.auth_configured,
    }
