"""Accounts (Supabase JWT verification) and saved CVs with version history."""

import dataclasses
import time
import uuid
from datetime import timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

import services.resume_service as resume_service
from core.config import get_settings
from db.models import ResumeVersion
from db.session import SessionLocal
from main import app

SECRET = "test-jwt-secret-with-at-least-32-bytes!"
ISSUER = "http://supabase.test/auth/v1"


def make_token(sub: str | None = None, secret: str = SECRET, **overrides) -> str:
    claims = {
        "sub": sub or str(uuid.uuid4()),
        "email": "user@example.com",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 3600,
        **overrides,
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def override_settings(monkeypatch, **changes) -> None:
    patched = dataclasses.replace(get_settings(), **changes)
    monkeypatch.setattr(resume_service, "get_settings", lambda: patched)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def user_headers() -> dict[str, str]:
    return auth(make_token())


def create(client: TestClient, headers: dict, **body) -> dict:
    payload = {"title": "Backend CV", "cv_data": {"name": "Ada Lovelace", "headline": "Engineer"}, **body}
    response = client.post("/api/resumes", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def backdate_versions(resume_id: str, minutes: int) -> None:
    with SessionLocal() as db:
        for version in db.query(ResumeVersion).filter_by(resume_id=resume_id):
            version.created_at = version.created_at - timedelta(minutes=minutes)
        db.commit()


@pytest.mark.parametrize(
    "token, message",
    [
        (None, "sign in"),
        ("not-a-jwt", "invalid"),
        (make_token(exp=int(time.time()) - 10), "expired"),
        (make_token(aud="other"), "invalid"),
        (make_token(iss="http://evil.test/auth/v1"), "invalid"),
        (make_token(role="anon"), "sign in"),
        (make_token(secret="wrong-secret-wrong-secret-wrong-secret"), "invalid"),
    ],
    ids=["missing", "garbage", "expired", "audience", "issuer", "anon-role", "bad-signature"],
)
def test_protected_routes_reject_bad_tokens(client, token, message) -> None:
    response = client.get("/api/resumes", headers=auth(token) if token else {})

    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"
    assert message in response.json()["detail"].lower()


def test_me_returns_token_identity(client) -> None:
    user_id = str(uuid.uuid4())
    response = client.get("/api/me", headers=auth(make_token(user_id, email="ada@example.com")))

    assert response.status_code == 200
    assert response.json() == {"id": user_id, "email": "ada@example.com"}


def test_create_list_get_update_delete(client, user_headers) -> None:
    created = create(client, user_headers, theme="jake", design_settings={"primaryColor": "#123456"})
    assert created["revision"] == 1
    assert created["latest_version"] == 1
    assert created["theme"] == "jake"
    assert created["cv_data"]["name"] == "Ada Lovelace"

    listing = client.get("/api/resumes", headers=user_headers).json()
    assert [item["id"] for item in listing["items"]] == [created["id"]]
    assert listing["items"][0]["name"] == "Ada Lovelace"

    updated = client.patch(
        f"/api/resumes/{created['id']}",
        json={"revision": 1, "title": "  Renamed   CV ", "cv_data": {"name": "Ada L."}},
        headers=user_headers,
    ).json()
    assert updated["revision"] == 2
    assert updated["title"] == "Renamed CV"
    assert updated["cv_data"]["name"] == "Ada L."
    # The snapshot interval has not elapsed, so no new version yet.
    assert updated["latest_version"] == 1

    assert client.delete(f"/api/resumes/{created['id']}", headers=user_headers).status_code == 204
    assert client.get(f"/api/resumes/{created['id']}", headers=user_headers).status_code == 404
    assert client.get("/api/resumes", headers=user_headers).json()["items"] == []


def test_stale_revision_is_rejected(client, user_headers) -> None:
    created = create(client, user_headers)
    url = f"/api/resumes/{created['id']}"
    assert client.patch(url, json={"revision": 1, "title": "Tab A"}, headers=user_headers).status_code == 200

    conflict = client.patch(url, json={"revision": 1, "title": "Tab B"}, headers=user_headers)

    assert conflict.status_code == 409
    assert conflict.json()["code"] == "revision_conflict"
    assert conflict.json()["fields"] == {"revision": "2"}
    assert client.get(url, headers=user_headers).json()["title"] == "Tab A"


def test_no_op_update_does_not_bump_revision(client, user_headers) -> None:
    created = create(client, user_headers)

    response = client.patch(
        f"/api/resumes/{created['id']}",
        json={"revision": 1, "title": created["title"]},
        headers=user_headers,
    )

    assert response.json()["revision"] == 1


def test_users_cannot_see_each_others_resumes(client, user_headers) -> None:
    created = create(client, user_headers)
    url = f"/api/resumes/{created['id']}"
    other = auth(make_token())

    assert client.get(url, headers=other).status_code == 404
    assert client.patch(url, json={"revision": 1, "title": "x"}, headers=other).status_code == 404
    assert client.delete(url, headers=other).status_code == 404
    assert client.get(f"{url}/versions", headers=other).status_code == 404
    assert client.post(f"{url}/versions/1/restore", headers=other).status_code == 404
    assert client.get("/api/resumes", headers=other).json()["items"] == []


def test_auto_snapshot_after_interval(client, user_headers) -> None:
    created = create(client, user_headers)
    backdate_versions(created["id"], minutes=get_settings().version_snapshot_minutes + 1)

    updated = client.patch(
        f"/api/resumes/{created['id']}",
        json={"revision": 1, "cv_data": {"name": "Changed"}},
        headers=user_headers,
    ).json()

    assert updated["latest_version"] == 2
    versions = client.get(f"/api/resumes/{created['id']}/versions", headers=user_headers).json()["items"]
    assert [(v["version"], v["source"]) for v in versions] == [(2, "auto"), (1, "create")]


def test_cover_letter_changes_do_not_create_versions(client, user_headers) -> None:
    created = create(client, user_headers)
    backdate_versions(created["id"], minutes=get_settings().version_snapshot_minutes + 1)

    updated = client.patch(
        f"/api/resumes/{created['id']}",
        json={"revision": 1, "cover_letter": {"targetRole": "Engineer", "letter": "Dear team"}},
        headers=user_headers,
    ).json()

    assert updated["revision"] == 2
    assert updated["cover_letter"]["letter"] == "Dear team"
    assert updated["latest_version"] == 1


def test_manual_version_and_restore(client, user_headers) -> None:
    created = create(client, user_headers, cv_data={"name": "Original"})
    url = f"/api/resumes/{created['id']}"

    saved = client.post(f"{url}/versions", json={"label": "Before tailoring"}, headers=user_headers)
    assert saved.status_code == 201
    assert saved.json()["source"] == "manual"
    assert saved.json()["label"] == "Before tailoring"

    client.patch(url, json={"revision": 1, "cv_data": {"name": "Tailored"}}, headers=user_headers)
    assert client.get(f"{url}/versions/1", headers=user_headers).json()["cv_data"]["name"] == "Original"

    restored = client.post(f"{url}/versions/1/restore", headers=user_headers)
    assert restored.status_code == 200
    assert restored.json()["cv_data"]["name"] == "Original"
    assert restored.json()["revision"] == 3

    versions = client.get(f"{url}/versions", headers=user_headers).json()["items"]
    assert [(v["source"], v["label"]) for v in versions[:2]] == [
        ("restore", "Restored version 1"),
        ("auto", "Before restore"),
    ]
    # The unsaved "Tailored" head was kept, so the restore can be undone.
    before_restore = client.get(f"{url}/versions/{versions[1]['version']}", headers=user_headers).json()
    assert before_restore["cv_data"]["name"] == "Tailored"
    assert client.get(f"{url}/versions/999", headers=user_headers).status_code == 404


def test_import_and_duplicate(client, user_headers) -> None:
    imported = create(client, user_headers, source="import")
    versions = client.get(f"/api/resumes/{imported['id']}/versions", headers=user_headers).json()["items"]
    assert versions[0]["source"] == "import"

    copy = client.post(f"/api/resumes/{imported['id']}/duplicate", headers=user_headers)
    assert copy.status_code == 201
    assert copy.json()["title"] == "Backend CV (copy)"
    assert copy.json()["cv_data"] == imported["cv_data"]
    assert copy.json()["id"] != imported["id"]


def test_resume_limit(client, monkeypatch) -> None:
    override_settings(monkeypatch, max_resumes_per_user=2)
    headers = auth(make_token())
    create(client, headers)
    create(client, headers)

    response = client.post("/api/resumes", json={"title": "Third"}, headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "resume_limit_reached"


def test_auto_versions_are_pruned(client, user_headers, monkeypatch) -> None:
    override_settings(monkeypatch, max_auto_versions=2, version_snapshot_minutes=0)
    created = create(client, user_headers)
    url = f"/api/resumes/{created['id']}"
    for revision in range(1, 5):
        client.patch(url, json={"revision": revision, "cv_data": {"name": f"Edit {revision}"}}, headers=user_headers)

    versions = client.get(f"{url}/versions", headers=user_headers).json()["items"]

    assert [v["source"] for v in versions] == ["auto", "auto", "create"]
    assert [v["version"] for v in versions] == [5, 4, 1]


def test_oversized_content_is_rejected(client, user_headers) -> None:
    huge = {"name": "Big", "summary": "x" * (600 * 1024)}

    response = client.post("/api/resumes", json={"title": "Huge", "cv_data": huge}, headers=user_headers)

    assert response.status_code == 413
    assert response.json()["code"] == "content_too_large"


def test_accounts_disabled_returns_503(client, monkeypatch) -> None:
    import core.auth

    disabled = dataclasses.replace(get_settings(), supabase_url="", supabase_jwt_secret="")
    monkeypatch.setattr(core.auth, "get_settings", lambda: disabled)

    response = client.get("/api/resumes", headers=auth(make_token()))

    assert response.status_code == 503


def test_hs256_tokens_verified_by_auth_server_when_no_secret(monkeypatch) -> None:
    import httpx

    import core.auth as core_auth

    settings = dataclasses.replace(get_settings(), supabase_jwt_secret="", supabase_anon_key="anon-key")
    calls: list[dict] = []

    def fake_get(url, headers, timeout):
        calls.append({"url": url, "headers": headers})
        if headers["Authorization"].endswith("revoked"):
            return httpx.Response(401, json={"msg": "invalid"})
        return httpx.Response(200, json={"id": "server-user", "email": "s@example.com", "role": "authenticated"})

    monkeypatch.setattr(core_auth.httpx, "get", fake_get)
    monkeypatch.setattr(core_auth, "_token_cache", {})
    token = make_token(secret="project-secret-unknown-to-backend-000000")

    user = core_auth.verify_access_token(token, settings)
    again = core_auth.verify_access_token(token, settings)

    assert user == again == core_auth.AuthUser(id="server-user", email="s@example.com")
    assert len(calls) == 1  # second call served from cache
    assert calls[0]["url"] == "http://supabase.test/auth/v1/user"
    assert calls[0]["headers"]["apikey"] == "anon-key"

    with pytest.raises(core_auth.AuthError):
        core_auth.verify_access_token(make_token(exp=int(time.time()) - 5), settings)
    assert len(calls) == 1  # expired tokens are rejected without a network call


def test_resume_thumbnail(client, user_headers, monkeypatch) -> None:
    from services.cv_service import CVService

    calls: list[dict] = []

    def fake_thumbnail(**kwargs):
        calls.append(kwargs)
        return b"png"

    monkeypatch.setattr(CVService, "render_thumbnail", fake_thumbnail)
    created = create(client, user_headers, theme="harvard")
    blank = create(client, user_headers, cv_data={"name": ""})

    response = client.get(f"/api/resumes/{created['id']}/thumbnail?section_order=education,experience", headers=user_headers)
    empty = client.get(f"/api/resumes/{blank['id']}/thumbnail", headers=user_headers)
    other = client.get(f"/api/resumes/{created['id']}/thumbnail", headers=auth(make_token()))

    assert response.status_code == 200
    assert response.json() == {"theme": "harvard", "image": "data:image/png;base64,cG5n", "error": None}
    assert calls[0]["section_order"] == ["education", "experience"]
    assert empty.json()["image"] is None
    assert len(calls) == 1
    assert other.status_code == 404
