"""Whole-CV tailoring: rules without AI, grounded AI rewrites, and the endpoint."""

import copy
import json

import pytest
from fastapi.testclient import TestClient

from main import app
from services import cv_tailor
from services.ai_service import AIService
from tests.test_pdf_import_accuracy import CV

JOB = """Senior Backend Engineer
Requirements:
- 6+ years building APIs with Python, FastAPI and PostgreSQL
- Docker and Kubernetes in production
Nice to have:
- Terraform and AWS
"""


@pytest.fixture
def no_ai(monkeypatch):
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))


def test_rules_reorder_skills_and_align_headline(no_ai) -> None:
    result = cv_tailor.tailor_cv(CV, JOB)

    assert result.source == "rules"
    languages = next(s for s in result.cv_data["skills"] if s["label"] == "Languages")
    assert languages["details"].startswith("Python")
    assert result.cv_data["headline"].startswith("Senior Backend Engineer")
    assert "Kubernetes" in result.missing_keywords
    # Missing skills are suggested, never written into the CV.
    assert "Kubernetes" not in json.dumps(result.cv_data["skills"])
    assert result.score_after >= result.score_before
    assert CV["skills"][0]["details"] == "TypeScript, Python, SQL, Go"  # the input is untouched


def test_headline_is_left_alone_for_a_different_field(no_ai) -> None:
    cv = copy.deepcopy(CV)
    cv["headline"] = "Registered Nurse"

    assert cv_tailor.tailor_cv(cv, JOB).cv_data["headline"] == "Registered Nurse"


def test_ai_summary_must_be_grounded(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(cv_tailor.tailor_service, "tailor", lambda *a, **k: cv_tailor.tailor_service.TailorResult("guidance"))
    invented = "Backend engineer with 12 years of Kubernetes and Terraform experience leading platform teams at scale across many industries and regions worldwide for large clients."
    monkeypatch.setattr(AIService, "call_provider", staticmethod(lambda **kwargs: json.dumps({"summary": invented})))

    result = cv_tailor.tailor_cv(CV, JOB)

    assert result.cv_data["summary"] == CV["summary"]


def test_ai_summary_is_used_when_grounded(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(cv_tailor.tailor_service, "tailor", lambda *a, **k: cv_tailor.tailor_service.TailorResult("guidance"))
    grounded = (
        "Backend-minded full-stack engineer with 7 years building reliable web products in Python and TypeScript. "
        "Designed REST APIs in FastAPI and PostgreSQL and led the rebuild of a payments dashboard used by 40k merchants."
    )
    monkeypatch.setattr(AIService, "call_provider", staticmethod(lambda **kwargs: json.dumps({"summary": grounded})))

    result = cv_tailor.tailor_cv(CV, JOB)

    assert result.source == "ai"
    assert result.cv_data["summary"] == grounded


def test_tailor_cv_endpoint(no_ai) -> None:
    response = TestClient(app).post("/api/job/tailor-cv", json={"cv_data": CV, "job_description": JOB})

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "rules"
    assert body["changes"]
    assert 0 <= body["score_before"] <= body["score_after"] <= 100
