"""CV review checks and the job-match score breakdown."""

import copy
from datetime import date

from fastapi.testclient import TestClient

from main import app
from services import job_match_service
from services.cv_analyzer import _past_tense, analyze
from tests.test_pdf_import_accuracy import CV


def messages(result) -> list[str]:
    return [issue.message for issue in result.issues]


def test_clean_cv_reads_back_fully_and_fits_one_page() -> None:
    result = analyze(CV, "folio")

    assert result.read_back and all(check.ok for check in result.read_back)
    assert result.page_count == 1
    assert not [i for i in result.issues if i.severity in ("high", "medium")]


def test_writing_issues_come_with_safe_fixes() -> None:
    cv = copy.deepcopy(CV)
    cv["experience"][1]["highlights"] = [
        "Responsible for the deploy pipeline used by every team",
        "Lead a team of three engineers to ship the mobile app",
        "I worked on many internal tools for the support team",
    ]

    result = analyze(cv, "folio")

    by_message = {issue.message: issue for issue in result.issues}
    weak = by_message["Weak opening: “responsible for”"]
    assert weak.fix == "Owned the deploy pipeline used by every team"
    assert (weak.section, weak.entry_index, weak.bullet_index) == ("experience", 1, 0)
    assert by_message["Present tense in a past role"].fix == "Led a team of three engineers to ship the mobile app"
    assert "First person in a bullet" in by_message


def test_consistency_catches_dates_order_and_duplicates() -> None:
    cv = copy.deepcopy(CV)
    cv["experience"].append({"company": "Acme", "position": "Intern", "start_date": "", "highlights": ["Tested releases weekly"]})
    cv["experience"][0]["start_date"] = "2021"
    cv["skills"][1]["details"] += ", Python"
    reversed_cv = copy.deepcopy(CV)
    reversed_cv["experience"].reverse()

    found = messages(analyze(cv, "folio"))
    assert "Acme has no start date" in found
    assert "Mixed date formats" in found
    assert "“Python” is listed twice" in found
    assert "Roles aren't in reverse date order" in messages(analyze(reversed_cv, "folio"))


def test_page_spill_is_flagged() -> None:
    cv = copy.deepcopy(CV)
    extra = "Shipped a measurable improvement to a core workflow used by thousands of merchants every single day"
    cv["experience"][0]["highlights"] += [extra] * 14

    result = analyze(cv, "folio")

    assert result.page_count >= 2
    if result.last_page_fill < 0.2:
        assert any(i.category == "layout" for i in result.issues)


def test_past_tense() -> None:
    assert [_past_tense(v) for v in ("Lead", "Manage", "Build", "deploy", "Copy")] == ["Led", "Managed", "Built", "deployed", "Copied"]


def test_analyze_endpoint() -> None:
    response = TestClient(app).post("/api/analyze", json={"cv_data": CV, "theme": "folio"})

    assert response.status_code == 200
    body = response.json()
    assert body["page_count"] == 1
    assert all(check["ok"] for check in body["read_back"])


def test_job_match_reports_experience_and_seniority() -> None:
    job = "Senior Backend Engineer\nRequirements:\n- 8+ years of experience with Python and PostgreSQL\n- Docker"

    result = job_match_service.analyze(CV, job)

    assert result.years_required == 8
    assert result.cv_years is not None and 4 < result.cv_years < 9
    assert result.seniority_required == "senior"
    assert result.seniority_cv == "senior"
    assert result.required_total >= 2
    assert 0 <= result.skills_coverage <= 100


def test_years_of_experience_merges_overlaps() -> None:
    cv = {"experience": [
        {"start_date": "2018-01", "end_date": "2020-01"},
        {"start_date": "2019-01", "end_date": "2021-01"},
        {"start_date": "2022-01", "end_date": "2023-01"},
    ]}

    assert job_match_service.cv_years_of_experience(cv, today=date(2026, 1, 1)) == 4.0
