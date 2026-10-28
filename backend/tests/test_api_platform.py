"""Error contract, render engine, and schema-export behavior."""

import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from core.errors import RenderTimeoutError, RenderValidationError
from main import app
from services import render_engine
from services.cv_service import CVService, PreviewPages
from services.render_engine import RenderCache


def test_validation_errors_use_safe_error_contract() -> None:
    client = TestClient(app)

    response = client.post("/api/render", json={"cv_data": {"experience": "not-a-list"}})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["request_id"]
    assert "cv_data.experience" in body["fields"]
    assert response.headers["X-Request-ID"] == body["request_id"]


def test_unexpected_render_errors_do_not_leak_internals(monkeypatch) -> None:
    def broken_render(**kwargs):
        raise RuntimeError("secret stdout and user yaml")

    monkeypatch.setattr(CVService, "render_cv", broken_render)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post("/api/download", json={"cv_data": {"name": "Leak Test"}})

    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "internal_error"
    assert "secret" not in response.text


def test_render_validation_errors_return_field_map(monkeypatch) -> None:
    def invalid_render(**kwargs):
        raise RenderValidationError("The CV has an invalid value.", fields={"website": "Invalid URL"})

    monkeypatch.setattr(CVService, "render_preview_pages", invalid_render)
    client = TestClient(app)

    response = client.post("/api/preview/pages", json={"cv_data": {"name": "Field User"}})

    assert response.status_code == 422
    assert response.json()["fields"] == {"website": "Invalid URL"}


def test_preview_pages_returns_data_urls(monkeypatch) -> None:
    monkeypatch.setattr(
        CVService,
        "render_preview_pages",
        lambda **kwargs: PreviewPages(pages=[b"one", b"two"], page_count=3, cached=False),
    )
    client = TestClient(app)

    response = client.post("/api/preview/pages", json={"cv_data": {"name": "Pages User"}})

    assert response.status_code == 200
    body = response.json()
    assert body["page_count"] == 3
    assert body["truncated"] is True
    assert body["pages"][0] == "data:image/png;base64,b25l"


def test_render_timeout_maps_to_504(monkeypatch) -> None:
    monkeypatch.setattr(render_engine, "_timeout_seconds", 0.05)

    def slow(**kwargs):
        time.sleep(0.5)
        return b"", "x.png"

    with pytest.raises(RenderTimeoutError):
        asyncio.run(render_engine.run_render(slow))


def test_render_cache_is_lru_bounded() -> None:
    cache = RenderCache(max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    assert cache.get("a") == 1  # "a" becomes most recent
    cache.set("c", 3)

    assert cache.get("b") is None
    assert cache.get("a") == 1
    assert cache.get("c") == 3
    # Section order changes the rendered PDF, so it must change the key.
    assert RenderCache.key_for({"skills": 1, "experience": 2}) != RenderCache.key_for({"experience": 2, "skills": 1})
    assert RenderCache.key_for({"a": [1, 2]}) == RenderCache.key_for({"a": [1, 2]})


def test_openapi_exposes_shared_cv_schema() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]

    assert {"CVData", "RenderRequest", "PreviewPagesResponse", "AIEnhanceCVResponse"}.issubset(components)
    assert "/api/preview/pages" in schema["paths"]


def test_committed_openapi_schema_is_current() -> None:
    """Fails when backend models change without regenerating frontend types."""
    from scripts.export_openapi import DEFAULT_OUTPUT, build_schema

    assert DEFAULT_OUTPUT.read_text(encoding="utf-8") == build_schema(), (
        "Run: python scripts/export_openapi.py && (cd ../frontend && npm run gen:api)"
    )


def test_thumbnails_render_each_theme_and_isolate_failures(monkeypatch) -> None:
    from core.errors import RenderValidationError

    def fake_thumbnail(**kwargs):
        if kwargs["theme"] == "broken":
            raise RenderValidationError("Bad value for this theme.")
        return f"png-{kwargs['theme']}".encode()

    monkeypatch.setattr(CVService, "render_thumbnail", fake_thumbnail)
    client = TestClient(app)

    response = client.post(
        "/api/preview/thumbnails",
        json={"cv_data": {"name": "Thumb"}, "items": [{"theme": "classic"}, {"theme": "broken"}, {"theme": "jake"}]},
    )

    assert response.status_code == 200
    thumbnails = response.json()["thumbnails"]
    assert [item["theme"] for item in thumbnails] == ["classic", "broken", "jake"]
    assert thumbnails[0]["image"].startswith("data:image/png;base64,")
    assert thumbnails[1] == {"theme": "broken", "image": None, "error": "Bad value for this theme."}
