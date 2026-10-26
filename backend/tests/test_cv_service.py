import sys
from pathlib import Path

import yaml
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from main import app
from services.cv_service import CVService


def sample_cv_data() -> dict:
    return {
        "name": "A User",
        "headline": "Software Engineer",
        "email": "user@example.com",
        "summary": "Builds reliable products.",
        "experience": [
            {
                "company": "Acme",
                "position": "Engineer",
                "start_date": "2022-01",
                "end_date": "present",
                "location": "Remote",
                "summary": "Owned platform work.",
                "highlights": ["Improved latency"],
            }
        ],
        "education": [
            {
                "institution": "State University",
                "area": "Computer Science",
                "degree": "BS",
                "start_date": "2018-09",
                "end_date": "2022-05",
                "location": "Boston, MA",
                "summary": "Focused on systems.",
                "highlights": ["Dean's list"],
            }
        ],
        "skills": [{"label": "Languages", "details": "Python, TypeScript"}],
        "projects": [
            {
                "name": "Project X",
                "start_date": "2024-01",
                "end_date": "2024-06",
                "location": "Open source",
                "url": "github.com/example/project-x",
                "summary": "A developer tool.",
                "highlights": ["Launched v1"],
            }
        ],
        "publications": [
            {
                "title": "Useful Systems",
                "authors": "A User, B User",
                "journal": "SystemsConf",
                "date": "2024-07",
                "doi": "10.1234/example",
                "url": "https://example.com/paper",
                "summary": "A systems paper.",
            }
        ],
        "honors": [{"bullet": "Best Paper Award"}],
        "patents": [{"number": "Adaptive Build System Patent"}],
        "talks": [{"reversed_number": "Reliable Builds - DevConf 2025"}],
    }


def test_build_yaml_maps_frontend_fields_and_applies_section_order() -> None:
    result = CVService._build_yaml_structure(
        sample_cv_data(),
        "classic",
        {"primaryColor": "#004F90", "fontFamily": "Source Sans 3"},
        ["skills", "experience", "education", "projects", "publications", "honors", "patents", "talks"],
    )

    sections = result["cv"]["sections"]
    assert list(sections.keys()) == [
        "Summary",
        "skills",
        "experience",
        "education",
        "projects",
        "publications",
        "selected_honors",
        "patents",
        "invited_talks",
    ]

    assert sections["experience"][0]["position"] == "Engineer"
    assert sections["experience"][0]["start_date"] == "2022-01"
    assert sections["experience"][0]["highlights"] == ["Improved latency"]
    assert sections["education"][0]["area"] == "Computer Science"
    assert sections["skills"][0] == {"label": "Languages", "details": "Python, TypeScript"}
    assert sections["projects"][0]["url"] == "https://github.com/example/project-x"
    assert sections["projects"][0]["highlights"] == [
        "Live demo: [github.com/example/project-x](https://github.com/example/project-x)",
        "Launched v1",
    ]
    assert sections["publications"][0]["journal"] == "SystemsConf"
    assert sections["publications"][0]["doi"] == "10.1234/example"
    assert sections["selected_honors"][0]["bullet"] == "Best Paper Award"
    assert sections["patents"][0]["number"] == "Adaptive Build System Patent"
    assert sections["invited_talks"][0]["reversed_number"] == "Reliable Builds - DevConf 2025"

    assert result["design"]["colors"]["section_titles"] == "#004F90"
    assert result["design"]["typography"]["font_family"] == "Source Sans 3"


def test_build_yaml_does_not_duplicate_project_link_highlight() -> None:
    result = CVService._build_yaml_structure(
        {
            "name": "Link User",
            "projects": [
                {
                    "name": "Portfolio",
                    "url": "https://portfolio.example.com",
                    "highlights": [
                        "Live demo: [portfolio.example.com](https://portfolio.example.com)",
                        "Built with Next.js",
                    ],
                }
            ],
        },
        "classic",
        {},
        ["projects"],
    )

    highlights = result["cv"]["sections"]["projects"][0]["highlights"]
    assert highlights == [
        "Live demo: [portfolio.example.com](https://portfolio.example.com)",
        "Built with Next.js",
    ]


def test_build_yaml_omits_empty_or_incomplete_draft_entries() -> None:
    result = CVService._build_yaml_structure(
        {
            "name": "Draft User",
            "experience": [{"company": "Acme", "position": ""}],
            "education": [{"institution": "State University", "area": ""}],
            "skills": [{"label": "Languages", "details": ""}],
            "projects": [{"name": ""}],
            "publications": [{"title": "Untitled", "authors": ""}],
            "honors": [{"bullet": ""}],
            "patents": [{"number": ""}],
            "talks": [{"reversed_number": ""}],
        },
        "classic",
        {},
        ["skills", "experience", "education", "projects", "publications", "honors", "patents", "talks"],
    )

    assert "sections" not in result["cv"]


def test_build_yaml_normalizes_common_editor_dates() -> None:
    result = CVService._build_yaml_structure(
        {
            "name": "Date User",
            "experience": [
                {
                    "company": "Google",
                    "position": "Senior",
                    "start_date": "jan 2020",
                    "end_date": "present",
                }
            ],
        },
        "classic",
        {},
        ["experience"],
    )

    entry = result["cv"]["sections"]["experience"][0]
    assert entry["start_date"] == "2020-01"
    assert entry["end_date"] == "present"


def test_build_yaml_normalizes_pakistan_local_mobile_number() -> None:
    result = CVService._build_yaml_structure(
        {
            "name": "Phone User",
            "phone": "03007038803",
            "location": "Lahore, Punjab, Pakistan",
        },
        "classic",
        {},
        [],
    )

    assert result["cv"]["phone"] == "+923007038803"


def test_build_yaml_omits_invalid_phone_instead_of_breaking_preview() -> None:
    result = CVService._build_yaml_structure(
        {
            "name": "Phone User",
            "phone": "not a phone",
        },
        "classic",
        {},
        [],
    )

    assert "phone" not in result["cv"]


def test_build_yaml_resolves_ats_template_aliases() -> None:
    jake_result = CVService._build_yaml_structure(
        {"name": "Alias User"},
        "jake",
        {},
        [],
    )
    sheets_result = CVService._build_yaml_structure(
        {"name": "Alias User"},
        "sheets",
        {},
        [],
    )

    assert jake_result["design"]["theme"] == "sb2nov"
    assert sheets_result["design"]["theme"] == "engineeringresumes"


def test_yaml_endpoint_returns_later_section_content() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/yaml",
        json={
            "cv_data": {
                "name": "Skill User",
                "skills": [{"label": "Languages", "details": "Python"}],
            },
            "theme": "classic",
            "section_order": ["skills", "experience"],
        },
    )

    assert response.status_code == 200
    yaml_payload = yaml.safe_load(response.json()["yaml"])
    assert list(yaml_payload["cv"]["sections"].keys()) == ["skills"]
    assert yaml_payload["cv"]["sections"]["skills"][0]["details"] == "Python"


def test_themes_endpoint_returns_all_builtin_theme_metadata() -> None:
    client = TestClient(app)

    response = client.get("/api/themes")

    assert response.status_code == 200
    payload = response.json()
    theme_ids = {theme["id"] for theme in payload["themes"]}
    assert {
        "jake",
        "sheets",
        "classic",
        "moderncv",
        "sb2nov",
        "engineeringclassic",
        "engineeringresumes",
        "ember",
        "harvard",
        "ink",
        "opal",
    }.issubset(theme_ids)
    assert payload["default"] == "classic"

    first_theme = payload["themes"][0]
    assert {
        "id",
        "name",
        "description",
        "bestFor",
        "previewImage",
        "sectionOrderType",
        "renderTheme",
        "atsScore",
        "atsRationale",
        "recommendedFor",
    }.issubset(first_theme)

    jake_theme = next(theme for theme in payload["themes"] if theme["id"] == "jake")
    sheets_theme = next(theme for theme in payload["themes"] if theme["id"] == "sheets")
    assert jake_theme["renderTheme"] == "sb2nov"
    assert sheets_theme["renderTheme"] == "engineeringresumes"


def test_preview_endpoint_accepts_ats_template_alias(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_render_cv(**kwargs):
        captured.update(kwargs)
        return b"png-data", "Alias_CV.png"

    monkeypatch.setattr(CVService, "render_cv", fake_render_cv)
    client = TestClient(app)

    response = client.post(
        "/api/preview",
        json={
            "cv_data": {"name": "Alias User"},
            "theme": "jake",
            "format": "png",
            "section_order": ["education", "experience", "projects", "skills"],
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert captured["theme"] == "jake"


def test_yaml_endpoint_maps_ats_template_alias_to_rendercv_theme() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/yaml",
        json={
            "cv_data": {"name": "Alias User"},
            "theme": "sheets",
            "section_order": ["experience", "education", "skills"],
        },
    )

    assert response.status_code == 200
    yaml_payload = yaml.safe_load(response.json()["yaml"])
    assert yaml_payload["design"]["theme"] == "engineeringresumes"


def test_design_settings_map_to_rendercv_design_and_section_layout() -> None:
    from schemas.cv import DesignSettings

    design = DesignSettings(
        pageSize="a4",
        marginCm=1.2,
        fontSizePt=10.5,
        lineSpacingEm=0.7,
        sectionSpacingCm=0.4,
        showFooter=False,
        sectionOrder=["skills", "summary", "experience"],
        hiddenSections=["projects", "not-a-section"],
    ).model_dump()
    cv = {
        "name": "Layout User",
        "summary": "Summary text",
        "skills": [{"label": "Languages", "details": "Python"}],
        "experience": [{"company": "Co", "position": "Dev", "start_date": "2020-01"}],
        "projects": [{"name": "Hidden project"}],
    }

    result = CVService._build_yaml_structure(cv, "classic", design, ["experience", "skills"])

    assert design["hiddenSections"] == ["projects"]
    assert list(result["cv"]["sections"]) == ["skills", "Summary", "experience"]
    assert result["design"]["page"] == {
        "size": "a4",
        "top_margin": "1.2cm",
        "bottom_margin": "1.2cm",
        "left_margin": "1.2cm",
        "right_margin": "1.2cm",
        "show_footer": False,
    }
    assert result["design"]["typography"] == {"font_size": {"body": "10.5pt"}, "line_spacing": "0.7em"}
    assert result["design"]["section_titles"] == {"space_above": "0.4cm"}


def test_theme_order_keeps_summary_first_without_custom_order() -> None:
    cv = {"name": "Order User", "summary": "Summary", "skills": [{"label": "L", "details": "D"}]}

    result = CVService._build_yaml_structure(cv, "classic", {"hiddenSections": []}, ["skills", "summary"])

    assert list(result["cv"]["sections"]) == ["Summary", "skills"]


def test_out_of_range_design_values_are_rejected() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/yaml",
        json={"cv_data": {"name": "X"}, "design_settings": {"fontSizePt": 40}},
    )

    assert response.status_code == 422
    assert "design_settings.fontSizePt" in response.json()["fields"]


def test_render_cache_distinguishes_section_order(monkeypatch) -> None:
    import services.cv_service as cv_service
    from services.render_engine import render_cache

    render_cache.clear()
    compiled: list[str] = []

    def fake_compile(source: str, output_format: str):
        compiled.append(source)
        return [source.encode("utf-8")]

    monkeypatch.setattr(cv_service, "_compile_typst", fake_compile)
    cv = {"name": "Cache User", "summary": "S", "skills": [{"label": "L", "details": "D"}]}

    first = CVService.render_preview_pages(cv_data=cv, design_settings={"sectionOrder": ["summary", "skills"]})
    second = CVService.render_preview_pages(cv_data=cv, design_settings={"sectionOrder": ["skills", "summary"]})
    repeat = CVService.render_preview_pages(cv_data=cv, design_settings={"sectionOrder": ["skills", "summary"]})

    assert len(compiled) == 2
    assert first.pages != second.pages
    assert repeat.cached is True
