"""Runtime settings read once from the environment."""

import os
from dataclasses import dataclass, field
from functools import lru_cache

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


DEFAULT_CORS_ORIGINS = ",".join(
    [
        *(f"http://{host}:{port}" for port in range(3000, 3006) for host in ("localhost", "127.0.0.1")),
        "https://pure-cv-builder-7oj5.vercel.app",
    ]
)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    """Application settings. Construct via get_settings()."""

    environment: str = "development"
    log_level: str = "INFO"
    cors_origins: list[str] = field(default_factory=list)
    cors_origin_regex: str | None = None

    rate_limit_enabled: bool = True
    rate_limit_preview: str = "60/minute"
    rate_limit_render: str = "20/minute"
    rate_limit_ai: str = "20/minute"
    rate_limit_default: str = "30/minute"

    render_workers: int = 2
    render_timeout_seconds: int = 60
    render_cache_size: int = 64
    preview_max_pages: int = 4

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    regex = os.getenv("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")
    return Settings(
        environment=os.getenv("ENVIRONMENT", "development"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        cors_origins=_split_csv(os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)),
        cors_origin_regex=regex or None,
        rate_limit_enabled=_env_bool("RATE_LIMIT_ENABLED", True),
        rate_limit_preview=os.getenv("RATE_LIMIT_PREVIEW", "60/minute"),
        rate_limit_render=os.getenv("RATE_LIMIT_RENDER", "20/minute"),
        rate_limit_ai=os.getenv("RATE_LIMIT_AI", "20/minute"),
        rate_limit_default=os.getenv("RATE_LIMIT_DEFAULT", "30/minute"),
        render_workers=max(1, _env_int("RENDER_WORKERS", 2)),
        render_timeout_seconds=max(5, _env_int("RENDER_TIMEOUT_SECONDS", 60)),
        render_cache_size=max(0, _env_int("RENDER_CACHE_SIZE", 64)),
        preview_max_pages=max(1, _env_int("PREVIEW_MAX_PAGES", 4)),
    )
