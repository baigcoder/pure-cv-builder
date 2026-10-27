"""Import accuracy: PDFs in common CV layouts must come back as the CV that made them.

Covers several RenderCV templates (dates in a right or left column, entries
split across rows), a Word-style CV (caps headings, pipe-separated lines) and
a two-column CV with a sidebar written after the main column.
"""

import fitz
import pytest

from services.cv_service import CVService
from services.pdf_extract_service import PDFExtractService

CV = {
    "name": "Jordan Rivera",
    "headline": "Senior Full-Stack Engineer",
    "email": "jordan.rivera@example.com",
    "phone": "",
    "location": "Toronto, Canada",
    "website": "jordanrivera.dev",
    "linkedin": "jordanrivera",
    "github": "jordanrivera",
    "summary": "Full-stack engineer with 7 years building reliable web products in TypeScript and Python. Led the rebuild of a payments dashboard used by 40k merchants and mentor a team of four engineers.",
    "experience": [
        {
            "company": "Northwind Payments",
            "position": "Senior Software Engineer",
            "start_date": "2021-03",
            "end_date": "present",
            "location": "Toronto, Canada",
            "highlights": [
                "Led the rebuild of the merchant dashboard in React and TypeScript, cutting page load time from 4.1s to 1.3s",
                "Designed REST APIs in FastAPI and PostgreSQL serving 2M requests per day",
                "Mentored four engineers and introduced code review guidelines adopted across the org"
            ]
        },
        {
            "company": "Brightlane",
            "position": "Software Engineer",
            "start_date": "2018-06",
            "end_date": "2021-02",
            "location": "Remote",
            "highlights": [
                "Built a real-time inventory sync between Shopify and warehouse systems using Node.js and Redis",
                "Set up CI/CD with GitHub Actions and Docker, reducing release time from days to under an hour"
            ]
        }
    ],
    "education": [
        {
            "institution": "University of Waterloo",
            "area": "Computer Science",
            "degree": "BSc",
            "start_date": "2014-09",
            "end_date": "2018-05",
            "location": "Waterloo, Canada",
            "highlights": [
                "Dean's Honours List"
            ]
        }
    ],
    "skills": [
        {
            "label": "Languages",
            "details": "TypeScript, Python, SQL, Go"
        },
        {
            "label": "Frameworks",
            "details": "React, Next.js, Node.js, FastAPI"
        },
        {
            "label": "Infrastructure",
            "details": "PostgreSQL, Redis, Docker, AWS, GitHub Actions"
        }
    ],
    "projects": [
        {
            "name": "OpenInvoice",
            "start_date": "2022-01",
            "end_date": "present",
            "url": "github.com/jordanrivera/openinvoice",
            "summary": "Open-source invoicing tool for freelancers.",
            "highlights": [
                "1.2k GitHub stars; PDF generation and Stripe payments"
            ]
        }
    ]
}

ORDER = ["experience", "education", "skills", "projects"]


def word_style_pdf(cv: dict) -> bytes:
    """A typical Word-exported CV: caps headings, pipe-separated contact and role lines."""
    lines = [
        (cv["name"], 20, True),
        (cv["headline"], 11, False),
        (f'{cv["email"]} | {cv["location"]} | linkedin.com/in/{cv["linkedin"]} | github.com/{cv["github"]} | {cv["website"]}', 9, False),
        ("", 6, False),
        ("PROFESSIONAL SUMMARY", 11, True),
        (cv["summary"], 10, False),
        ("", 6, False),
        ("PROFESSIONAL EXPERIENCE", 11, True),
    ]
    for job in cv["experience"]:
        lines.append((f'{job["position"]} | {job["company"]} | {job["location"]}', 10, True))
        lines.append((f'{job["start_date"]} - {job["end_date"]}', 9, False))
        for bullet in job["highlights"]:
            lines.append((f"- {bullet}", 10, False))
        lines.append(("", 4, False))
    lines.append(("EDUCATION", 11, True))
    for edu in cv["education"]:
        lines.append((f'{edu["degree"]} in {edu["area"]}, {edu["institution"]}', 10, True))
        lines.append((f'{edu["start_date"]} - {edu["end_date"]}', 9, False))
    lines.append(("", 4, False))
    lines.append(("SKILLS", 11, True))
    for skill in cv["skills"]:
        lines.append((f'{skill["label"]}: {skill["details"]}', 10, False))
    lines.append(("", 4, False))
    lines.append(("PROJECTS", 11, True))
    for project in cv["projects"]:
        lines.append((project["name"], 10, True))
        lines.append((project["summary"], 10, False))
        for bullet in project["highlights"]:
            lines.append((f"- {bullet}", 10, False))
    doc = fitz.open()
    page = doc.new_page()
    y = 50
    for text, size, bold in lines:
        if not text:
            y += size
            continue
        rect = fitz.Rect(50, y, 560, y + 200)
        height = page.insert_textbox(rect, text, fontsize=size, fontname="hebo" if bold else "helv")
        used = 200 - height if height >= 0 else 200
        y += max(size * 1.4, used + 2)
        if y > 760:
            page = doc.new_page()
            y = 50
    return doc.tobytes()


def two_column_pdf(cv: dict) -> bytes:
    """Sidebar (contact, skills, education) on the left; main column on the right.
    The sidebar is written last, as many design tools do."""
    doc = fitz.open()
    page = doc.new_page()
    main = [cv["name"], cv["headline"], "", "SUMMARY", cv["summary"], "", "EXPERIENCE"]
    for job in cv["experience"]:
        main += [job["company"], f'{job["position"]}  {job["start_date"]} - {job["end_date"]}'] + [f"- {b}" for b in job["highlights"]] + [""]
    main += ["PROJECTS"]
    for project in cv["projects"]:
        main += [project["name"], project["summary"]] + [f"- {b}" for b in project["highlights"]]
    page.insert_textbox(fitz.Rect(210, 40, 570, 800), "\n".join(main), fontsize=9, fontname="helv")
    side = ["CONTACT", cv["email"], cv["location"], cv["website"], f'linkedin.com/in/{cv["linkedin"]}', "", "SKILLS"]
    side += [f'{s["label"]}: {s["details"]}' for s in cv["skills"]] + ["", "EDUCATION"]
    for edu in cv["education"]:
        side += [edu["institution"], f'{edu["degree"]}, {edu["area"]}', f'{edu["start_date"]} - {edu["end_date"]}']
    page.insert_textbox(fitz.Rect(30, 40, 195, 800), "\n".join(side), fontsize=8.5, fontname="helv")
    return doc.tobytes()



def _check(got: dict, *, contact: tuple[str, ...]) -> None:
    for field in ("name", "headline", "email", *contact):
        assert (got.get(field) or "").lower() == CV[field].lower(), field
    assert got["summary"] == CV["summary"]
    assert [(e["company"], e["position"], e["start_date"], e["end_date"]) for e in got["experience"]] == [
        (e["company"], e["position"], e["start_date"], e["end_date"]) for e in CV["experience"]
    ]
    assert [e["highlights"] for e in got["experience"]] == [e["highlights"] for e in CV["experience"]]
    assert [(e["institution"], e["degree"], e["area"]) for e in got["education"]] == [
        (e["institution"], e["degree"], e["area"]) for e in CV["education"]
    ]
    assert len(got["skills"]) == len(CV["skills"])
    assert [p["name"] for p in got["projects"]] == [p["name"] for p in CV["projects"]]


@pytest.mark.parametrize("theme", ["folio", "classic", "jake", "moderncv", "executive", "signal", "scholar", "engineeringresumes"])
def test_rendered_templates_round_trip(theme: str) -> None:
    pdf, _ = CVService.render_cv(cv_data=CV, output_format="pdf", theme=theme, section_order=ORDER)

    got = PDFExtractService.extract_from_pdf(pdf)["cv_data"]

    _check(got, contact=("location", "website", "linkedin", "github"))


def test_word_style_cv() -> None:
    _check(PDFExtractService.extract_from_pdf(word_style_pdf(CV))["cv_data"], contact=("location", "website", "linkedin", "github"))


def test_two_column_cv_with_sidebar_after_main_column() -> None:
    _check(PDFExtractService.extract_from_pdf(two_column_pdf(CV))["cv_data"], contact=("location", "website", "linkedin"))
