"""Job matching, tailoring and the AI fact-check must work beyond software jobs."""

import json

import pytest

from services import cv_tailor, grounding
from services.ai_service import AIService
from services.job_match_service import analyze, find_skills

NURSE_CV = {
    "name": "Maria Lopez",
    "headline": "Registered Nurse | Critical Care",
    "summary": "Registered nurse with 6 years in intensive care, focused on patient assessment and family education.",
    "experience": [
        {
            "company": "St. Mary's Hospital",
            "position": "ICU Registered Nurse",
            "start_date": "2020-01",
            "end_date": "present",
            "highlights": [
                "Performed patient assessments and administered medication for 4 to 6 critically ill patients per shift",
                "Managed wound care and IV therapy, charting in Epic",
            ],
        }
    ],
    "skills": [{"label": "Clinical", "details": "Telemetry, Patient Education, Infection Control, Wound Care"}],
    "honors": [{"bullet": "BLS certification, 2024"}],
}

NURSE_JOB = """Registered Nurse - Emergency Department
Requirements:
- Current RN license, BLS and ACLS certification
- Patient assessment, medication administration and wound care
- Charting in Epic EHR
Nice to have: telemetry, triage experience
"""

JOBS = {
    "sales": ("Sales Manager\nWhat you bring:\n- B2B sales with quota attainment\n- Salesforce CRM, pipeline management, forecasting\n- Negotiation and account management",
              {"B2B Sales", "Quota Attainment", "Salesforce", "Pipeline Management", "Forecasting", "Negotiation", "Account Management"}),
    "accountant": ("Staff Accountant\nRequirements: CPA preferred, knowledge of GAAP, accounts payable and receivable, bank reconciliations, month-end close, QuickBooks",
                   {"CPA", "GAAP", "Accounts Payable", "Accounts Receivable", "Reconciliation", "Month-End Close", "QuickBooks"}),
    "teacher": ("Primary Teacher\nYou will need:\n- QTS or teaching licence\n- Lesson planning, classroom management, differentiated instruction\n- Parent communication and student assessment",
                {"Teaching License", "Lesson Planning", "Classroom Management", "Differentiated Instruction", "Parent Communication", "Student Assessment"}),
    "hr": ("HR Generalist\nRequirements:\n- Recruitment, onboarding and employee relations\n- Workday HRIS, payroll\n- SHRM-CP preferred",
           {"Recruitment", "Onboarding", "Employee Relations", "Workday", "HRIS", "Payroll", "SHRM"}),
}


@pytest.mark.parametrize("profession", list(JOBS))
def test_job_ads_outside_tech_are_understood(profession: str) -> None:
    job, expected = JOBS[profession]

    result = analyze({}, job)

    found = {item.keyword for item in result.matched + result.missing}
    assert expected <= found


def test_inline_preferred_only_downgrades_its_own_item() -> None:
    result = analyze({}, JOBS["accountant"][0])

    importance = {item.keyword: item.importance for item in result.missing}
    assert importance["CPA"] == "preferred"
    assert importance["GAAP"] == "required"


def test_nurse_cv_matches_nurse_job() -> None:
    result = analyze(NURSE_CV, NURSE_JOB)

    matched = {item.keyword for item in result.matched}
    missing = {item.keyword for item in result.missing}
    # A Registered Nurse holds an RN licence by definition, so the title counts.
    assert {"Patient Assessment", "Medication Administration", "Wound Care", "Epic", "BLS", "Telemetry", "RN License"} <= matched
    assert {"ACLS", "Triage"} <= missing
    assert result.score >= 50


def test_unknown_skills_are_matched_from_the_ad_itself() -> None:
    job = "Warehouse Associate\nRequirements:\n- Pallet jack operation, order picking\n- Shipping and receiving"
    cv = {"experience": [{"company": "Acme", "position": "Picker", "highlights": ["Operated pallet jacks and picked orders for next-day shipping"]}]}

    result = analyze(cv, job)

    matched = {item.keyword.lower() for item in result.matched}
    assert "pallet jack operation" in matched
    assert "order picking" in matched


def test_lexicon_respects_capitalised_product_names() -> None:
    assert "Epic" in find_skills("Charted in Epic")
    assert "Epic" not in find_skills("An epic effort")
    assert "Lean" not in find_skills("I lean on my team")


def test_fact_check_catches_invented_certifications() -> None:
    source = json.dumps(NURSE_CV)

    invented = grounding.check("Registered nurse holding ACLS and PALS certification with 6 years in ICU", source)

    assert set(invented.skills) == {"ACLS", "PALS"}
    assert not grounding.check("ICU nurse with BLS, experienced in wound care and IV therapy", source)


def test_tailoring_a_nurse_cv(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))

    result = cv_tailor.tailor_cv(NURSE_CV, NURSE_JOB)

    clinical = result.cv_data["skills"][0]["details"]
    assert clinical.split(", ")[:2] == ["Wound Care", "Telemetry"]
    assert "ACLS" in result.missing_keywords
    assert "ACLS" not in json.dumps(result.cv_data)
    assert result.cv_data["headline"].startswith("Registered Nurse")
    assert result.score_after >= result.score_before
