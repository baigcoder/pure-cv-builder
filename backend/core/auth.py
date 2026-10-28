"""Verify Supabase Auth access tokens and expose the signed-in user.

Supabase signs session JWTs with the project's asymmetric signing key (published
at ``/auth/v1/.well-known/jwks.json``). Older projects sign with a shared HS256
secret: set ``SUPABASE_JWT_SECRET`` to verify locally, or ``SUPABASE_ANON_KEY``
to have the Supabase auth server confirm each token (cached briefly).
"""

import hashlib
import logging
import threading
import time
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import Settings, get_settings
from core.errors import AppError, ServiceUnavailableError

logger = logging.getLogger(__name__)

ASYMMETRIC_ALGORITHMS = ["RS256", "ES256", "EdDSA"]

_bearer = HTTPBearer(auto_error=False)
_jwks_client: jwt.PyJWKClient | None = None
_jwks_lock = threading.Lock()

TOKEN_CACHE_SECONDS = 60
TOKEN_CACHE_MAX = 2048
_token_cache: dict[str, tuple[float, "AuthUser"]] = {}
_token_cache_lock = threading.Lock()


class AuthError(AppError):
    status_code = 401
    code = "unauthorized"


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str


def _get_jwks_client(settings: Settings) -> jwt.PyJWKClient:
    global _jwks_client
    with _jwks_lock:
        if _jwks_client is None:
            _jwks_client = jwt.PyJWKClient(
                f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
                cache_keys=True,
                lifespan=3600,
                timeout=5,
            )
        return _jwks_client


def verify_access_token(token: str, settings: Settings | None = None) -> AuthUser:
    """Return the user for a valid Supabase access token, else raise AuthError."""
    settings = settings or get_settings()
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as error:
        raise AuthError("Your session is invalid. Please sign in again.") from error

    algorithm = header.get("alg", "")
    if algorithm == "HS256" and not settings.supabase_jwt_secret:
        if settings.supabase_url and settings.supabase_anon_key:
            return _verify_with_auth_server(token, settings)
        raise AuthError("Your session is invalid. Please sign in again.")

    if algorithm == "HS256":
        key: object = settings.supabase_jwt_secret
        algorithms = ["HS256"]
    elif algorithm in ASYMMETRIC_ALGORITHMS and settings.supabase_url:
        try:
            key = _get_jwks_client(settings).get_signing_key_from_jwt(token).key
        except jwt.PyJWKClientError as error:
            logger.warning("Could not load Supabase signing key: %s", error)
            raise AuthError("Your session could not be verified. Please sign in again.") from error
        algorithms = [algorithm]
    else:
        raise AuthError("Your session is invalid. Please sign in again.")

    try:
        claims = jwt.decode(
            token,
            key=key,
            algorithms=algorithms,
            audience=settings.supabase_jwt_audience,
            issuer=f"{settings.supabase_url}/auth/v1" if settings.supabase_url else None,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as error:
        raise AuthError("Your session has expired. Please sign in again.") from error
    except jwt.PyJWTError as error:
        raise AuthError("Your session is invalid. Please sign in again.") from error

    if claims.get("role") != "authenticated":
        raise AuthError("Please sign in to continue.")

    return AuthUser(id=str(claims["sub"]), email=str(claims.get("email") or ""))


def _verify_with_auth_server(token: str, settings: Settings) -> AuthUser:
    """Validate a token by asking Supabase Auth who it belongs to.

    Used for HS256 tokens when the shared secret isn't configured. Results are
    cached briefly (never past the token's expiry) so autosave requests don't
    each make a network round trip.
    """
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError as error:
        raise AuthError("Your session is invalid. Please sign in again.") from error
    expires_at = float(unverified.get("exp") or 0)
    now = time.time()
    if expires_at <= now:
        raise AuthError("Your session has expired. Please sign in again.")

    cache_key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _token_cache_lock:
        cached = _token_cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

    try:
        response = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
            timeout=5,
        )
    except httpx.HTTPError as error:
        logger.warning("Supabase auth server unreachable: %s", error.__class__.__name__)
        raise ServiceUnavailableError("Sign-in service is unreachable. Please try again.") from error

    if response.status_code != 200:
        raise AuthError("Your session is invalid. Please sign in again.")
    data = response.json()
    if data.get("role") != "authenticated" or not data.get("id"):
        raise AuthError("Please sign in to continue.")

    user = AuthUser(id=str(data["id"]), email=str(data.get("email") or ""))
    with _token_cache_lock:
        if len(_token_cache) >= TOKEN_CACHE_MAX:
            _token_cache.clear()
        _token_cache[cache_key] = (min(now + TOKEN_CACHE_SECONDS, expires_at), user)
    return user


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthUser:
    """FastAPI dependency for routes that require a signed-in user."""
    settings = get_settings()
    if not settings.auth_configured:
        raise ServiceUnavailableError("Accounts are not enabled on this server.")
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthError("Please sign in to continue.")

    user = verify_access_token(credentials.credentials, settings)
    request.state.user_id = user.id
    return user
