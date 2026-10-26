"""Single shared rate limiter so every route counts against the same storage."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from core.config import get_settings

settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.rate_limit_enabled,
    headers_enabled=False,
)

PREVIEW_LIMIT = settings.rate_limit_preview
RENDER_LIMIT = settings.rate_limit_render
AI_LIMIT = settings.rate_limit_ai
DEFAULT_LIMIT = settings.rate_limit_default
