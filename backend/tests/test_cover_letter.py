import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from main import app
from services.ai_service import AIService
from services.cover_letter_service import CoverLetterService


def sample_cover_letter_payload(ai_only: bool = False) -> dict:
    return {
        "cv_data": {
            "name": "A User",
            "headline": "Full-Stack Engineer",
            "email": "user@example.com",
            "phone": "+15551234567",
            "location": "Remote",
            "summary": "Builds reliable React, Node.js, and Python systems for production teams.",
            "experience": [
                {
                    "company": "Acme",
                    "position": "Software Engineer",
                    "highlights": ["Improved API latency by 35% through caching and query tuning."],
                }
            ],
            "skills": [
                {"label": "Frontend", "details": "React, Next.js, TypeScript"},
                {"label": "Backend", "details": "FastAPI, PostgreSQL, Docker"},
            ],
            "projects": [
                {
                    "name": "ApplyForge",
                    "summary": "shipped a live document builder with PDF exports and API rendering.",
                }
            ],
        },
        "cover_letter": {
            "target_role": "Senior Full-Stack Engineer",
            "company": "Northstar Labs",
            "hiring_manager": "Hiring Team",
            "job_description": (
                "We need a Senior Full-Stack Engineer with React, TypeScript, FastAPI, "
                "API design, Docker, performance optimization, and production ownership."
            ),
            "tone": "professional",
            "letter": "",
        },
        "ai_only": ai_only,
    }


def test_generate_cover_letter_returns_template_when_ai_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)

    response = client.post("/api/cover-letter/generate", json=sample_cover_letter_payload())

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "template"
    assert "Northstar Labs" in payload["letter"]
    assert "Dear Hiring Team" in payload["letter"]
    assert payload["word_count"] > 80


def test_generate_cover_letter_uses_location_and_country_context(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)
    payload = sample_cover_letter_payload()
    payload["cv_data"]["location"] = "Lahore, Punjab, Pakistan"

    response = client.post("/api/cover-letter/generate", json=payload)

    assert response.status_code == 200
    letter = response.json()["letter"]
    assert "Lahore, Punjab, Pakistan" in letter
    assert "Pakistan" in letter


def test_auto_cover_letter_template_avoids_placeholder_noise(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)
    payload = sample_cover_letter_payload()
    payload["cv_data"]["name"] = "Muhammad Hassan Baig"
    payload["cv_data"]["location"] = "Dha Phase 8 Lahore, Pakistan"
    payload["cv_data"]["experience"] = []
    payload["cv_data"]["skills"] = [
        {"label": "Languages", "details": "TypeScript, JavaScript, C++"},
        {"label": "Tools", "details": "React, Node.js, Docker"},
    ]
    payload["cv_data"]["projects"] = [
        {
            "name": "TrueVibe ? AI-Driven Trust-First Social Media Platform June 2025",
            "summary": "Full-Stack Developer (Project) | Live Demo",
        }
    ]
    payload["cover_letter"]["target_role"] = "Full-Stack Developer (Project) | Live Demo"
    payload["cover_letter"]["company"] = ""
    payload["cover_letter"]["job_description"] = (
        "Target role: Full-Stack Developer. Candidate location: Lahore, Pakistan. "
        "Key skills to emphasize: TypeScript, JavaScript, React, Node.js, Docker."
    )

    response = client.post("/api/cover-letter/generate", json=payload)

    assert response.status_code == 200
    letter = response.json()["letter"]
    assert "Target Organization" not in letter
    assert "Auto-generated" not in letter
    assert "application brief" not in letter
    assert "Languages," not in letter
    assert "Live Demo" not in letter
    assert "Full-Stack Developer (Project)" not in letter
    assert "your team" in letter
    assert "TypeScript" in letter
    assert "TrueVibe" in letter


def test_cover_letter_service_sanitizes_generic_company_and_role() -> None:
    letter = CoverLetterService.build_fallback_letter(
        cv_data=sample_cover_letter_payload()["cv_data"],
        target_role="Full-Stack Developer (Project) | Live Demo",
        company="Target Organization",
        hiring_manager="",
        job_description="Auto-generated application brief with React, TypeScript, and API delivery.",
    )

    assert "Target Organization" not in letter
    assert "Full-Stack Developer (Project)" not in letter
    assert "Auto-generated" not in letter
    assert "your team" in letter


def test_generate_cover_letter_returns_503_for_ai_only_when_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)

    response = client.post("/api/cover-letter/generate", json=sample_cover_letter_payload(ai_only=True))

    assert response.status_code == 503
    assert "AI cover letter generation is not configured" in response.json()["detail"]


def test_generate_cover_letter_validates_required_target_fields() -> None:
    client = TestClient(app)
    payload = sample_cover_letter_payload()
    payload["cover_letter"]["job_description"] = "too short"

    response = client.post("/api/cover-letter/generate", json=payload)

    assert response.status_code == 422


def test_download_cover_letter_returns_pdf() -> None:
    client = TestClient(app)
    payload = sample_cover_letter_payload()
    payload["cover_letter"]["letter"] = (
        "Dear Hiring Team,\n\n"
        "I am excited to apply for the Senior Full-Stack Engineer role at Northstar Labs. "
        "My background combines React, TypeScript, FastAPI, and production API ownership.\n\n"
        "Thank you for reviewing my application.\n\n"
        "Sincerely,\nA User"
    )

    response = client.post("/api/cover-letter/download", json=payload)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
