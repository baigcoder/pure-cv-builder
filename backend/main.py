"""
FastAPI Backend for RenderCV Web Application.

Provides REST API endpoints for:
- Generating CV previews (PNG images)
- Downloading CVs as PDF
- Listing available themes
"""

import os
import sys
import logging
import time
import uuid
from pathlib import Path


class RequestIdFilter(logging.Filter):
    """Attach a default request_id so third-party logs do not break formatting."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


# Configure logging with structured format
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] %(message)s" if os.getenv("ENVIRONMENT") == "production" else "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
for handler in logging.getLogger().handlers:
    handler.addFilter(RequestIdFilter())

logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from api.render import router as render_router

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="RenderCV Web API",
    description="Generate professional CVs from structured data",
    version="1.0.0"
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── CORS middleware (must be registered BEFORE custom @app.middleware decorators) ──
# In Starlette, add_middleware uses LIFO ordering, and @app.middleware("http")
# decorators are always inner. Registering CORS here makes it the outermost
# layer so it correctly handles OPTIONS preflight requests.
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,"
    "http://localhost:3001,http://127.0.0.1:3001,"
    "http://localhost:3002,http://127.0.0.1:3002,"
    "http://localhost:3003,http://127.0.0.1:3003,"
    "http://localhost:3004,http://127.0.0.1:3004,"
    "http://localhost:3005,http://127.0.0.1:3005"
)
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]
logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request logging middleware ──
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests with timing."""
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()
    
    # Add request_id to state for logging
    request.state.request_id = request_id
    
    # Log request
    logger.info(
        "%s %s",
        request.method,
        request.url.path,
        extra={"request_id": request_id},
    )
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Log response
        logger.info(
            "Completed %s in %.3fs",
            response.status_code,
            process_time,
            extra={"request_id": request_id},
        )
        
        # Add custom headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = str(process_time)
        
        return response
    except Exception as e:
        logger.error("Error: %s", str(e), extra={"request_id": request_id})
        raise


# ── Security headers middleware ──
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # Only add strict transport security in production
    if os.getenv("ENVIRONMENT") == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    return response


# ── Routes ──
app.include_router(render_router, prefix="/api")


@app.get("/health")
async def health_check():
    """Health check endpoint for Railway."""
    return {"status": "healthy"}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Avoid noisy 404 logs when browsers request a backend favicon."""
    return Response(status_code=204)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "RenderCV Web API is running"}


@app.get("/api/health")
@limiter.limit("60/minute")
async def api_health_check(request: Request):
    """Detailed health check for API."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": os.getenv("ENVIRONMENT", "development")
    }
