"""Job match analysis and bullet tailoring."""

import json

from fastapi.testclient import TestClient

from main import app
from services.ai_service import AIService
from services.job_match_service import analyze, find_skills
from services.tailor_service import is_safe_rewrite

JOB_POST = """Senior Backend Engineer
About the role
You will go above and beyond to build the rest of our platform this spring.
Requirements:
- 5+ years of experience with Python and Django or FastAPI
- Strong PostgreSQL and REST API design skills
- Experience with Docker and k8s in production
- Excellent communication and mentoring
Nice to have:
- Terraform, AWS Lambda
- Experience with golang is a plus
"""

CV = {
    "name": "Ada Lovelace",
    "headline": "Backend Engineer",
    "summary": "Python engineer.",
    "skills": [{"label": "Languages", "details": "Python, SQL"}, {"label": "Infra", "details": "Docker, Kubernetes"}],
    "experience": [
        {
            "company": "Engines Ltd",
            "position": "Software Engineer",
            "highlights": ["Built FastAPI services on Postgres for 3 teams", "Mentored two junior engineers"],
        }
    ],
}


def test_find_skills_uses_aliases_and_ignores_english_words() -> None:
    found = find_skills("We use k8s, Postgres, ReactJS and react native. The rest of the team goes on spring break.")

    assert found == {"Kubernetes": 1, "PostgreSQL": 1, "React": 1, "React Native": 1}
    assert find_skills("REST APIs on Node.js, C++ and .NET with CI/CD") == {
        "REST APIs": 1,
        "Node.js": 1,
        "C++": 1,
        ".NET": 1,
        "CI/CD": 1,
    }
    assert "Mentoring" in find_skills("Mentored three engineers")


def test_analyze_scores_coverage_and_prioritises_required_gaps() -> None:
    result = analyze(CV, JOB_POST)

    matched = {item.keyword: item for item in result.matched}
    missing = [item.keyword for item in result.missing]
    assert {"Python", "FastAPI", "PostgreSQL", "Docker", "Kubernetes", "Mentoring"} <= set(matched)
    assert matched["Kubernetes"].found_in == ["skills"]
    assert "experience" in matched["PostgreSQL"].found_in
    assert missing[0] in {"REST APIs", "API Design", "Communication", "Django"}
    assert {"Terraform", "AWS", "Go"} <= set(missing)
    assert next(item for item in result.missing if item.keyword == "Terraform").importance == "preferred"
    assert result.years_required == 5
    assert result.title_match is True
    assert 0 < result.score < 100
    assert all(item.suggestion for item in result.missing)


def test_full_coverage_scores_high() -> None:
    result = analyze(CV, "Requirements:\n- Python and FastAPI\n- PostgreSQL")

    assert result.missing == []
    assert result.score >= 85


def test_job_match_endpoint(client=None) -> None:
    client = TestClient(app)

    response = client.post("/api/job/match", json={"cv_data": CV, "job_description": JOB_POST})

    assert response.status_code == 200
    body = response.json()
    assert body["target_title"] == "Senior Backend Engineer"
    assert {item["keyword"] for item in body["missing"]} >= {"Terraform"}


def test_safe_rewrite_rejects_invented_numbers_and_multiline() -> None:
    original = "Built FastAPI services on Postgres for 3 teams"

    assert is_safe_rewrite(original, "Built REST APIs with FastAPI and PostgreSQL for 3 teams")
    assert not is_safe_rewrite(original, "Built REST APIs for 3 teams, cutting latency 40%")
    assert not is_safe_rewrite(original, "Built APIs\nfor 3 teams")
    assert not is_safe_rewrite(original, original)


def test_tailor_returns_guidance_without_ai(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)

    response = client.post("/api/job/tailor-bullets", json={"cv_data": CV, "job_description": JOB_POST})

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "guidance"
    assert body["suggestions"] == []
    hint_keywords = {keyword for hint in body["hints"] for keyword in hint["keywords"]}
    assert hint_keywords & {"REST APIs", "Django", "Communication", "API Design"}


def test_tailor_keeps_only_safe_ai_rewrites(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    provider_output = json.dumps(
        {
            "suggestions": [
                {"id": "experience:0:0", "text": "Built REST APIs with FastAPI and PostgreSQL for 3 teams"},
                {"id": "experience:0:1", "text": "Mentored 2 junior engineers, raising velocity 30%"},
                {"id": "experience:9:9", "text": "Invented bullet"},
            ]
        }
    )
    monkeypatch.setattr(AIService, "call_provider", staticmethod(lambda **kwargs: provider_output))
    client = TestClient(app)

    response = client.post("/api/job/tailor-bullets", json={"cv_data": CV, "job_description": JOB_POST})

    body = response.json()
    assert body["source"] == "ai"
    assert len(body["suggestions"]) == 1
    suggestion = body["suggestions"][0]
    assert (suggestion["section"], suggestion["entry_index"], suggestion["bullet_index"]) == ("experience", 0, 0)
    assert "REST APIs" in suggestion["keywords_added"]
