import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from main import app
from services.ai_service import AIService, clean_plain_text


def test_ai_status_returns_capability_metadata(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)

    response = client.get("/api/ai/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["configured"] is False
    assert payload["fallback_available"] is True
    assert "summary" in payload["supported_tasks"]
    assert "cover_letter" in payload["supported_tasks"]


def test_ai_suggest_returns_fallback_when_unconfigured(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)

    response = client.post(
        "/api/ai/suggest",
        json={
            "type": "bullet",
            "text": "reduced API latency by optimizing database queries",
            "context": "Backend Engineer",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "fallback"
    assert "Delivered" in payload["suggestion"]
    assert payload["warnings"]


def test_ai_suggest_validates_unknown_type() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/ai/suggest",
        json={"type": "unknown", "text": "Improve this", "context": ""},
    )

    assert response.status_code == 422


def test_ai_suggest_falls_back_for_empty_provider_response(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(AIService, "call_provider", staticmethod(lambda **kwargs: ""))
    client = TestClient(app)

    response = client.post(
        "/api/ai/suggest",
        json={"type": "summary", "text": "Builds production web apps.", "context": "Full-stack developer"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "fallback"
    assert payload["suggestion"]


def test_ai_enhance_cv_returns_structured_fallback(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)

    response = client.post(
        "/api/ai/enhance-cv",
        json={
            "current_score": 52,
            "target_role": "Full-Stack Developer (Project) | Live Demo",
            "job_description": "",
            "cv_data": {
                "name": "Muhammad Hassan Baig",
                "email": "hassanbaig1243@gmail.com",
                "phone": "03007038803",
                "location": "Dha Phase 8 Lahore, Pakistan",
                "summary": "",
                "headline": "",
                "skills": [{"label": "Languages", "details": "TypeScript, JavaScript, C++"}],
                "projects": [
                    {
                        "name": "TrueVibe",
                        "summary": "Full-Stack Developer (Project) | Live Demo",
                        "highlights": ["Built a trust-centric platform with AI-based deepfake detection."],
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "fallback"
    assert payload["cv_data"]["headline"].startswith("Full-Stack Developer")
    assert "ambiguous product requirements" in payload["cv_data"]["summary"]
    assert payload["cv_data"]["skills"][-1]["label"] == "ATS Market Fit"
    assert "Live Demo" not in payload["cv_data"]["projects"][0]["summary"]
    assert payload["changes"]


def test_clean_plain_text_removes_markdown_formatting() -> None:
    result = clean_plain_text('```markdown\n- **Improved** `API` latency\n```')

    assert result == "Improved API latency"
