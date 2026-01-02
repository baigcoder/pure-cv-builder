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
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.render import router as render_router

app = FastAPI(
    title="RenderCV Web API",
    description="Generate professional CVs from structured data",
    version="1.0.0"
)


@app.get("/health")
async def health_check():
    """Health check endpoint for Railway."""
    return {"status": "healthy"}

# CORS middleware - use environment variable for production
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]
logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(render_router, prefix="/api")


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "RenderCV Web API is running"}


@app.get("/api/health")
async def health_check():
    """Detailed health check for API."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": os.getenv("ENVIRONMENT", "development")
    }
