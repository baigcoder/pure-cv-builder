"""AI output may rephrase but not invent: numbers and skills must come from the user's material."""

import copy
import json

from fastapi.testclient import TestClient

from main import app
from services import grounding
from services.ai_service import AIService
from tests.test_pdf_import_accuracy import CV


def test_numbers_compare_by_value() -> None:
    assert grounding.numbers("40k, 40,000, 2 M, 2 million, 1.3s, 300 ms") == {40000.0, 2000000.0, 1.3, 300.0}


def test_check_flags_invented_skills_and_numbers_only() -> None:
    source = "Led the rebuild used by 40k merchants; 2M requests per day; Python, Docker, AWS"

    assert not grounding.check("Served 40,000 merchants and 2 million requests with Python", source)
    invented = grounding.check("Ran Kubernetes and Terraform for 12 teams", source)
    assert invented.skills == ["Kubernetes", "Terraform"]
    assert invented.numbers == ["12"]


def test_summary_suggestion_with_invented_skill_falls_back(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(
        AIService,
        "call_provider",
        staticmethod(lambda **kwargs: "Backend engineer with deep Kubernetes and microservices experience building reliable web products in Python."),
    )

    result = AIService.suggest("summary", "Engineer building reliable web products in Python.", "Backend Engineer")

    assert result.source == "fallback"


def test_enhance_reverts_only_the_invented_fields(monkeypatch) -> None:
    improved = copy.deepcopy(CV)
    improved["headline"] = "Senior Full-Stack Engineer | Python, TypeScript"  # grounded
    improved["summary"] = "Engineer with 12 years of Kubernetes experience."  # invented
    improved["experience"][0]["highlights"][1] = "Designed REST APIs in FastAPI and PostgreSQL serving 2 million requests daily"  # grounded
    improved["experience"][0]["highlights"][2] = "Mentored 9 engineers on Terraform"  # invented
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(AIService, "call_provider", staticmethod(lambda **kwargs: json.dumps({"cv_data": improved, "changes": ["Improved"]})))

    result = AIService.enhance_cv_for_ats(CV, "Senior Engineer")

    out = result["cv_data"]
    assert result["source"] == "ai"
    assert out["headline"] == improved["headline"]
    assert out["summary"] == CV["summary"]
    assert out["experience"][0]["highlights"][1] == improved["experience"][0]["highlights"][1]
    assert out["experience"][0]["highlights"][2] == CV["experience"][0]["highlights"][2]
    assert result["warnings"] and "2 places" in result["warnings"][0]


def _stream(body: dict) -> dict:
    response = TestClient(app).post("/api/cover-letter/stream", json=body)
    done = [line for line in response.text.split("\n\n") if line.startswith("event: done")]
    return json.loads(done[0].split("data: ", 1)[1])


def _letter_body() -> dict:
    return {
        "cv_data": CV,
        "cover_letter": {
            "target_role": "Senior Backend Engineer",
            "company": "Northwind",
            "job_description": "We need Python, FastAPI and PostgreSQL. Terraform and Kubernetes are a plus for this backend role.",
            "highlights": "I use Northwind as a merchant.",
        },
    }


GOOD_LETTER = (
    "Dear Hiring Team,\n\n" + "I led the rebuild of a payments dashboard used by 40k merchants and designed REST APIs in FastAPI and PostgreSQL. " * 9
    + "\n\nSincerely,\nJordan Rivera"
)


def test_cover_letter_with_invented_skill_is_retried_without_it(monkeypatch) -> None:
    bad = GOOD_LETTER.replace("PostgreSQL.", "PostgreSQL, and I run Terraform daily.")
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(AIService, "stream_provider", staticmethod(lambda *a, **k: iter([bad])))
    prompts = []

    def retry(**kwargs):
        prompts.append(kwargs["prompt"])
        return GOOD_LETTER

    monkeypatch.setattr(AIService, "call_provider", staticmethod(retry))

    done = _stream(_letter_body())

    assert done["source"] == "ai"
    assert "Terraform" not in done["letter"]
    assert "Terraform" in prompts[0].rsplit("previous draft", 1)[1]


def test_cover_letter_falls_back_when_retry_still_invents(monkeypatch) -> None:
    bad = GOOD_LETTER.replace("PostgreSQL.", "PostgreSQL, and I run Kubernetes daily.")
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(AIService, "stream_provider", staticmethod(lambda *a, **k: iter([bad])))
    monkeypatch.setattr(AIService, "call_provider", staticmethod(lambda **kwargs: bad))

    done = _stream(_letter_body())

    assert done["source"] == "template"
    assert "Kubernetes" not in done["letter"]
