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


def _normalize_database_url(url: str) -> str:
    """Use the psycopg 3 driver for plain postgres:// URLs (as Supabase gives them)."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


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
    rate_limit_save: str = "120/minute"

    render_workers: int = 2
    render_timeout_seconds: int = 60
    render_cache_size: int = 64
    preview_max_pages: int = 4

    # Postgres in production (Supabase connection string); SQLite locally.
    database_url: str = "sqlite:///./applyforge.db"
    db_auto_migrate: bool = True

    # Supabase Auth. Asymmetric tokens are verified against the project's JWKS.
    # Legacy HS256 tokens are verified with SUPABASE_JWT_SECRET when set, else
    # by asking the Supabase auth server (needs SUPABASE_ANON_KEY).
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_audience: str = "authenticated"

    max_resumes_per_user: int = 50
    version_snapshot_minutes: int = 10
    max_auto_versions: int = 50

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url or self.supabase_jwt_secret)

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
        rate_limit_save=os.getenv("RATE_LIMIT_SAVE", "120/minute"),
        render_workers=max(1, _env_int("RENDER_WORKERS", 2)),
        render_timeout_seconds=max(5, _env_int("RENDER_TIMEOUT_SECONDS", 60)),
        render_cache_size=max(0, _env_int("RENDER_CACHE_SIZE", 64)),
        preview_max_pages=max(1, _env_int("PREVIEW_MAX_PAGES", 4)),
        database_url=_normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./applyforge.db")),
        db_auto_migrate=_env_bool("DB_AUTO_MIGRATE", True),
        supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/"),
        supabase_jwt_secret=os.getenv("SUPABASE_JWT_SECRET", ""),
        supabase_anon_key=os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY", ""),
        supabase_jwt_audience=os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated"),
        max_resumes_per_user=max(1, _env_int("MAX_RESUMES_PER_USER", 50)),
        version_snapshot_minutes=max(0, _env_int("VERSION_SNAPSHOT_MINUTES", 10)),
        max_auto_versions=max(1, _env_int("MAX_AUTO_VERSIONS", 50)),
    )
