"""Share links, the application tracker, Word export, bullet rewrites, job links and LinkedIn import."""

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from main import app
from services import job_fetch_service, rewrite_service
from services.ai_service import AIService
from services.linkedin_import_service import parse_linkedin
from tests.test_resumes import auth, create, make_token


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def user_headers() -> dict[str, str]:
    return auth(make_token())


@pytest.fixture(autouse=True)
def no_ai(monkeypatch):
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))


# ---------- Share links ----------

def test_share_link_lifecycle_and_view_counts(client, user_headers) -> None:
    resume = create(client, user_headers, cv_data={"name": "Ada Lovelace", "summary": "Engineer who ships."})
    share_url = f"/api/resumes/{resume['id']}/share"

    assert client.get(share_url, headers=user_headers).json()["enabled"] is False

    enabled = client.put(share_url, json={"enabled": True, "section_order": ["experience"]}, headers=user_headers).json()
    assert enabled["enabled"] is True and enabled["slug"]

    public = client.get(f"/api/public/cv/{enabled['slug']}")
    assert public.status_code == 200
    assert public.json()["name"] == "Ada Lovelace"
    assert public.json()["pages"][0].startswith("data:image/png;base64,")

    pdf = client.get(f"/api/public/cv/{enabled['slug']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    status = client.get(share_url, headers=user_headers).json()
    assert status["views"] == 1 and status["downloads"] == 1

    # Turning it off hides the page but keeps the slug for re-enabling.
    client.put(share_url, json={"enabled": False}, headers=user_headers)
    assert client.get(f"/api/public/cv/{enabled['slug']}").status_code == 404
    again = client.put(share_url, json={"enabled": True}, headers=user_headers).json()
    assert again["slug"] == enabled["slug"]


def test_share_link_cannot_be_toggled_by_another_user(client, user_headers) -> None:
    resume = create(client, user_headers)

    response = client.put(f"/api/resumes/{resume['id']}/share", json={"enabled": True}, headers=auth(make_token()))

    assert response.status_code == 404


def test_deleted_cv_share_link_stops_working(client, user_headers) -> None:
    resume = create(client, user_headers)
    slug = client.put(f"/api/resumes/{resume['id']}/share", json={"enabled": True}, headers=user_headers).json()["slug"]

    client.delete(f"/api/resumes/{resume['id']}", headers=user_headers)

    assert client.get(f"/api/public/cv/{slug}").status_code == 404


def test_unknown_share_link_is_404(client) -> None:
    assert client.get("/api/public/cv/does-not-exist").status_code == 404


# ---------- Applications ----------

def test_application_crud_and_applied_date(client, user_headers) -> None:
    created = client.post(
        "/api/applications",
        json={"company": "Northwind", "role": "Engineer", "job_url": "https://jobs.example.com/1"},
        headers=user_headers,
    )
    assert created.status_code == 201
    application = created.json()
    assert application["status"] == "saved" and application["applied_at"] is None

    moved = client.patch(f"/api/applications/{application['id']}", json={"status": "applied", "notes": "Sent"}, headers=user_headers).json()
    assert moved["status"] == "applied" and moved["applied_at"] and moved["notes"] == "Sent"

    listing = client.get("/api/applications", headers=user_headers).json()["items"]
    assert [item["id"] for item in listing] == [application["id"]]

    assert client.delete(f"/api/applications/{application['id']}", headers=user_headers).status_code == 204
    assert client.get("/api/applications", headers=user_headers).json()["items"] == []


def test_application_rejects_bad_links_and_foreign_cvs(client, user_headers) -> None:
    bad_link = client.post("/api/applications", json={"company": "A", "role": "B", "job_url": "javascript:alert(1)"}, headers=user_headers)
    assert bad_link.status_code == 422

    other_cv = create(client, auth(make_token()))
    foreign = client.post("/api/applications", json={"company": "A", "role": "B", "resume_id": other_cv["id"]}, headers=user_headers)
    assert foreign.status_code == 404


def test_applications_are_private_to_their_owner(client, user_headers) -> None:
    application = client.post("/api/applications", json={"company": "A", "role": "B"}, headers=user_headers).json()

    other = auth(make_token())
    assert client.get("/api/applications", headers=other).json()["items"] == []
    assert client.patch(f"/api/applications/{application['id']}", json={"status": "offer"}, headers=other).status_code == 404


def test_tailor_copies_cv_with_job_in_cover_letter(client, user_headers) -> None:
    base = create(client, user_headers, cv_data={"name": "Ada Lovelace"})
    application = client.post(
        "/api/applications",
        json={"company": "Northwind", "role": "Staff Engineer", "job_description": "Build reliable APIs in Python."},
        headers=user_headers,
    ).json()

    result = client.post(f"/api/applications/{application['id']}/tailor", json={"base_resume_id": base["id"]}, headers=user_headers)

    assert result.status_code == 201
    body = result.json()
    assert body["application"]["resume_id"] == body["resume_id"]
    assert body["application"]["resume_title"] == "Northwind - Staff Engineer"
    copy = client.get(f"/api/resumes/{body['resume_id']}", headers=user_headers).json()
    assert copy["cv_data"]["name"] == "Ada Lovelace"
    assert copy["cover_letter"]["company"] == "Northwind"
    assert copy["cover_letter"]["jobDescription"] == "Build reliable APIs in Python."


# ---------- Word export ----------

def test_docx_export_contains_cv_content(client) -> None:
    response = client.post(
        "/api/download/docx",
        json={
            "theme": "folio",
            "cv_data": {
                "name": "Ada Lovelace",
                "email": "ada@example.com",
                "summary": "Engineer who ships.",
                "experience": [{"company": "Northwind", "position": "Engineer", "start_date": "2021-03", "highlights": ["Led a rebuild"]}],
                "skills": [{"label": "Languages", "details": "Python, TypeScript"}],
            },
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats")
    xml = zipfile.ZipFile(io.BytesIO(response.content)).read("word/document.xml").decode("utf-8")
    for text in ("Ada Lovelace", "Northwind", "Led a rebuild", "Mar 2021", "Python, TypeScript"):
        assert text in xml


# ---------- Bullet rewrites ----------

@pytest.mark.parametrize(
    "mode, expected",
    [
        ("stronger", "Built the billing service"),
        ("shorten", "Built the billing service to cut costs"),
    ],
)
def test_rewrite_fallbacks(mode, expected) -> None:
    text = "Worked on the billing service in order to cut costs"
    result = rewrite_service.rewrite(text if mode == "shorten" else "worked on the billing service", mode)

    assert result.source == "fallback"
    assert expected in result.variants


def test_quantify_fallback_adds_fill_in_prompts_only_without_numbers() -> None:
    assert any("[X%]" in v for v in rewrite_service.rewrite("Improved page speed", "quantify").variants)
    assert all("[" not in v for v in rewrite_service.rewrite("Cut load time by 40%", "quantify").variants)


def test_rewrite_endpoint(client) -> None:
    response = client.post("/api/ai/rewrite-bullet", json={"text": "responsible for the deploy pipeline", "mode": "stronger"})

    assert response.status_code == 200
    assert response.json()["variants"] == ["Owned the deploy pipeline"]


# ---------- Job links ----------

@pytest.mark.parametrize(
    "url",
    ["http://127.0.0.1/job", "http://localhost/job", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/x", "ftp://example.com/job", "http://example.com:8080/job"],
)
def test_job_fetch_refuses_private_or_odd_urls(url) -> None:
    with pytest.raises(job_fetch_service.JobFetchError):
        job_fetch_service.fetch_job(url)


def test_job_page_parsing_prefers_structured_job_posting() -> None:
    page = """<html><head><title>Careers | Northwind</title>
    <script type="application/ld+json">{"@context": "https://schema.org", "@type": "JobPosting",
      "title": "Senior Backend Engineer", "hiringOrganization": {"@type": "Organization", "name": "Northwind"},
      "jobLocation": {"@type": "Place", "address": {"addressLocality": "Toronto", "addressCountry": "CA"}},
      "description": "&lt;p&gt;Build reliable APIs in Python and PostgreSQL.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Own the payments platform end to end&lt;/li&gt;&lt;li&gt;Mentor engineers&lt;/li&gt;&lt;/ul&gt;"}
    </script></head><body><nav>Menu</nav><p>Other text</p></body></html>"""

    job = job_fetch_service.parse_job_page("https://jobs.example.com/1", page)

    assert job.title == "Senior Backend Engineer"
    assert job.company == "Northwind"
    assert job.location == "Toronto, CA"
    assert "Build reliable APIs in Python" in job.description
    assert "• Mentor engineers" in job.description


def test_job_page_parsing_falls_back_to_visible_text() -> None:
    body = "<p>" + "We are hiring an engineer to build reliable systems. " * 6 + "</p>"
    page = f"<html><head><title>Backend Engineer - Acme</title><script>var x = 1;</script></head><body><nav>Home</nav>{body}</body></html>"

    job = job_fetch_service.parse_job_page("https://acme.example/jobs/2", page)

    assert job.title == "Backend Engineer"
    assert "var x" not in job.description and "Home" not in job.description


# ---------- LinkedIn import ----------

LINKEDIN_TEXT = """Contact
ada@example.com
www.linkedin.com/in/ada-lovelace (LinkedIn)
Top Skills
Python
Distributed Systems
PostgreSQL
Languages
English (Native or Bilingual)
Certifications
AWS Certified Solutions Architect
Ada Lovelace
Senior Software Engineer at Northwind
Toronto, Ontario, Canada
Summary
I build reliable payment systems and mentor engineers.
Experience
Northwind
4 years 2 months
Senior Software Engineer
January 2023 - Present (1 year 10 months)
Toronto, Ontario, Canada
• Led the rebuild of the merchant dashboard
• Cut page load time from 4.1s to 1.3s
Software Engineer
September 2020 - December 2022 (2 years 4 months)
Built the billing service.
Brightlane
Junior Developer
June 2018 - August 2020 (2 years 3 months)
Remote
Page 1 of 2
Education
University of Waterloo
Bachelor of Science - BS, Computer Science · (2014 - 2018)
"""


def test_linkedin_export_is_parsed_into_cv_data() -> None:
    cv = parse_linkedin(LINKEDIN_TEXT)

    assert cv is not None
    assert cv["name"] == "Ada Lovelace"
    assert cv["headline"] == "Senior Software Engineer at Northwind"
    assert cv["location"] == "Toronto, Ontario, Canada"
    assert cv["email"] == "ada@example.com"
    assert cv["linkedin"] == "ada-lovelace"
    assert cv["summary"].startswith("I build reliable payment systems")
    roles = [(e["company"], e["position"], e["start_date"], e["end_date"]) for e in cv["experience"]]
    assert roles == [
        ("Northwind", "Senior Software Engineer", "2023-01", "present"),
        ("Northwind", "Software Engineer", "2020-09", "2022-12"),
        ("Brightlane", "Junior Developer", "2018-06", "2020-08"),
    ]
    assert cv["experience"][0]["highlights"] == ["Led the rebuild of the merchant dashboard", "Cut page load time from 4.1s to 1.3s"]
    assert cv["experience"][0]["location"] == "Toronto, Ontario, Canada"
    assert cv["experience"][1]["summary"] == "Built the billing service."
    assert cv["education"] == [
        {"institution": "University of Waterloo", "degree": "BS", "area": "Computer Science", "start_date": "2014", "end_date": "2018"}
    ]
    assert cv["skills"][0] == {"label": "Top skills", "details": "Python, Distributed Systems, PostgreSQL"}
    assert cv["honors"] == [{"bullet": "Certification: AWS Certified Solutions Architect"}]


def test_regular_cv_text_is_not_treated_as_linkedin() -> None:
    assert parse_linkedin("Ada Lovelace\nExperience\nNorthwind\nEngineer") is None


def test_linkedin_role_under_same_company_ignores_unrecognised_bullets() -> None:
    # Some PDF fonts turn the bullet into "?"; that description line must not become a company.
    cv = parse_linkedin(LINKEDIN_TEXT.replace("\u2022", "?"))

    assert [entry["company"] for entry in cv["experience"]] == ["Northwind", "Northwind", "Brightlane"]
