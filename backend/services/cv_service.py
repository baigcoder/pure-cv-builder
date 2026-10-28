"""
CV Rendering Service.

Wraps RenderCV core functionality for web API use.
Uses the rendercv CLI for rendering since the PyPI package is CLI-based.
"""

import datetime
import logging
import re
import threading
from dataclasses import dataclass
from typing import Any

import pydantic
import pydantic_extra_types.phone_numbers as pydantic_phone_numbers
import rendercv_fonts
import typst
import yaml
from rendercv.exception import RenderCVUserError, RenderCVUserValidationError
from rendercv.renderer.pdf_png import get_package_path
from rendercv.renderer.templater.templater import render_full_template
from rendercv.schema.models.design.built_in_design import available_themes
from rendercv.schema.rendercv_model_builder import build_rendercv_dictionary_and_model

from core.config import get_settings
from core.errors import RenderFailedError, RenderValidationError
from services.render_engine import render_cache
from services.theme_presets import THEME_PRESETS, merge

logger = logging.getLogger(__name__)

_PHONE_VALIDATOR = pydantic.TypeAdapter[pydantic_phone_numbers.PhoneNumber](
    pydantic_phone_numbers.PhoneNumber
)

# RenderCV section keys mapped back to the editor's section ids for error fields.
_RENDERCV_TO_EDITOR_SECTION = {
    "Summary": "summary",
    "selected_honors": "honors",
    "invited_talks": "talks",
}

_compiler_local = threading.local()

# RenderCV parses YAML with one module-level ruamel parser, which is not
# thread-safe: concurrent renders corrupt its state. Validation is fast, so
# serialise only that step; Typst compilation still runs in parallel.
_rendercv_parse_lock = threading.Lock()

# Gallery thumbnails: enough to recognise a layout, ~10x smaller than previews.
THUMBNAIL_PPI = 48


@dataclass(frozen=True)
class PreviewPages:
    pages: list[bytes]
    page_count: int
    cached: bool


def _get_compiler() -> typst.Compiler:
    """One Typst compiler per render thread; building one loads every font."""
    compiler = getattr(_compiler_local, "compiler", None)
    if compiler is None:
        compiler = typst.Compiler(
            font_paths=list(rendercv_fonts.paths_to_font_folders),
            package_path=get_package_path(),
        )
        _compiler_local.compiler = compiler
    return compiler


def _compile_typst(typst_source: str, output_format: str, ppi: float | None = None) -> bytes | list[bytes]:
    """Compile Typst source to PDF bytes or a list of PNG page bytes."""
    try:
        output = _get_compiler().compile(input=typst_source.encode("utf-8"), format=output_format, ppi=ppi)
    except typst.TypstError as error:
        logger.error("Typst compilation failed: %s", error.message)
        raise RenderFailedError("The CV could not be rendered with this theme. Try another theme or font.") from error

    if output_format == "pdf":
        if not isinstance(output, bytes):
            raise RenderFailedError("The renderer returned no PDF.")
        return output

    pages = output if isinstance(output, list) else [output]
    pages = [page for page in pages if page]
    if not pages:
        raise RenderFailedError("The renderer returned no pages.")
    return pages


def _validation_fields(error: RenderCVUserValidationError) -> dict[str, str]:
    """Map RenderCV schema locations to editor field keys.

    ("cv", "phone") -> "phone"; ("cv", "sections", "experience", 0, "start_date")
    -> "experience.0.start_date"; design errors keep a "design." prefix.
    """
    fields: dict[str, str] = {}
    for item in error.validation_errors:
        location = [str(part) for part in (item.schema_location or ())]
        if len(location) >= 2 and location[0] == "cv" and location[1] == "sections" and len(location) >= 3:
            location = [_RENDERCV_TO_EDITOR_SECTION.get(location[2], location[2]), *location[3:]]
        elif location and location[0] == "cv":
            location = location[1:]
        key = ".".join(location) or "cv"
        fields.setdefault(key, item.message)
    return fields


class CVService:
    """Service for rendering CVs from structured data."""

    THEME_ALIASES = {
        "jake": "sb2nov",
        "sheets": "engineeringresumes",
    }
    
    THEME_METADATA = {
        "classic": {
            "name": "Classic Professional",
            "description": "Traditional professional layout with refined typography.",
            "bestFor": "Corporate, finance, legal, operations",
            "previewImage": "/theme-classic.png",
            "sectionOrderType": "standard",
            "renderTheme": "classic",
            "atsScore": 88,
            "atsRationale": "Clean conventional structure with readable headings and restrained styling.",
            "recommendedFor": ["corporate", "finance", "legal", "operations"],
        },
        "moderncv": {
            "name": "Modern Minimal",
            "description": "Modern structure with a clean, confident hierarchy.",
            "bestFor": "Product, design, marketing, startups",
            "previewImage": "/theme-moderncv.png",
            "sectionOrderType": "standard",
            "renderTheme": "moderncv",
            "atsScore": 82,
            "atsRationale": "Readable and structured, best when a role allows subtle visual polish.",
            "recommendedFor": ["product", "design", "marketing", "startup"],
        },
        "sb2nov": {
            "name": "Sb2nov ATS Classic",
            "description": "Compact ATS-safe single-column format inspired by popular LaTeX resumes.",
            "bestFor": "Engineering, academia, research, graduate applications",
            "previewImage": "/theme-sb2nov.png",
            "sectionOrderType": "academic",
            "renderTheme": "sb2nov",
            "atsScore": 94,
            "atsRationale": "Full-width rules, simple contact row, standard section labels, and dense text flow.",
            "recommendedFor": ["academic", "research", "graduate", "software"],
        },
        "engineeringresumes": {
            "name": "Engineering ATS",
            "description": "Engineering layout with strong scanability and work-first density.",
            "bestFor": "Software, engineering, DevOps, data",
            "previewImage": "/theme-engineeringresumes.png",
            "sectionOrderType": "tech",
            "renderTheme": "engineeringresumes",
            "atsScore": 93,
            "atsRationale": "Plain text, strong section rules, no icons, and compact engineering entries.",
            "recommendedFor": ["software", "engineering", "devops", "data"],
        },
        "engineeringclassic": {
            "name": "Entry Level ATS",
            "description": "Education-first format for early-career candidates.",
            "bestFor": "Students, fresh graduates, career changers",
            "previewImage": "/theme-engineeringclassic.png",
            "sectionOrderType": "entry_level",
            "renderTheme": "engineeringclassic",
            "atsScore": 90,
            "atsRationale": "Education-first order with straightforward section flow for early-career profiles.",
            "recommendedFor": ["student", "new grad", "career changer", "education"],
        },
        "ember": {
            "name": "Ember",
            "description": "Warm editorial styling with crisp professional spacing.",
            "bestFor": "Consulting, creative leadership, business roles",
            "previewImage": "/theme-ember.png",
            "sectionOrderType": "standard",
            "renderTheme": "ember",
            "atsScore": 76,
            "atsRationale": "Professional but more editorial; use when visual tone matters more than maximum parser simplicity.",
            "recommendedFor": ["consulting", "creative", "leadership", "business"],
        },
        "harvard": {
            "name": "Harvard",
            "description": "Classic academic presentation with compact detail.",
            "bestFor": "Academic, policy, research, fellowships",
            "previewImage": "/theme-harvard.png",
            "sectionOrderType": "academic",
            "renderTheme": "harvard",
            "atsScore": 86,
            "atsRationale": "Academic-friendly structure with conservative typography and traditional headings.",
            "recommendedFor": ["academic", "policy", "research", "fellowship"],
        },
        "ink": {
            "name": "Ink",
            "description": "High-contrast format with a strong editorial feel.",
            "bestFor": "Leadership, writing, strategy, creative roles",
            "previewImage": "/theme-ink.png",
            "sectionOrderType": "portfolio",
            "renderTheme": "ink",
            "atsScore": 74,
            "atsRationale": "Readable but intentionally stylized; best for human-led review flows.",
            "recommendedFor": ["leadership", "writing", "strategy", "creative"],
        },
        "opal": {
            "name": "Opal",
            "description": "Polished modern layout with refined visual rhythm.",
            "bestFor": "Senior professionals, product, technology",
            "previewImage": "/theme-opal.png",
            "sectionOrderType": "standard",
            "renderTheme": "opal",
            "atsScore": 80,
            "atsRationale": "Polished and readable, with more visual styling than the strict ATS presets.",
            "recommendedFor": ["senior", "product", "technology", "management"],
        },
        "jake": {
            "name": "Jake ATS",
            "description": "Dense single-column engineering format modeled for parser-safe applications.",
            "bestFor": "Software engineers, students, new grads, project-heavy profiles",
            "previewImage": "/theme-jake.png",
            "sectionOrderType": "early_tech",
            "renderTheme": "sb2nov",
            "atsScore": 98,
            "atsRationale": "Single-column, rule-separated sections, standard headings, and compact text hierarchy.",
            "recommendedFor": ["software", "engineering", "student", "new grad", "projects"],
        },
        "sheets": {
            "name": "Sheets Recruiter ATS",
            "description": "Recruiter-first work history layout with conservative ATS-safe formatting.",
            "bestFor": "Experienced professionals, recruiters, operations, career pivots",
            "previewImage": "/theme-sheets.png",
            "sectionOrderType": "recruiter",
            "renderTheme": "engineeringresumes",
            "atsScore": 96,
            "atsRationale": "Work-first flow, plain typography, standard bullets, and no decorative parser risks.",
            "recommendedFor": ["experienced", "work history", "recruiter", "operations", "career pivot"],
        },
    }
    AVAILABLE_THEMES = available_themes

    @classmethod
    def resolve_theme(cls, theme: str) -> str:
        """Map Folio preset aliases to real RenderCV built-in themes."""
        if theme in THEME_PRESETS:
            return THEME_PRESETS[theme]["base"]
        return cls.THEME_ALIASES.get(theme, theme)
    
    @classmethod
    def get_themes(cls) -> list[str]:
        """Return list of available themes."""
        return [*THEME_PRESETS.keys(), *cls.THEME_ALIASES.keys(), *cls.AVAILABLE_THEMES]

    @classmethod
    def get_theme_metadata(cls) -> list[dict]:
        """Return metadata for all available built-in themes."""
        presets = [
            {
                "id": preset_id,
                **preset["meta"],
                "previewImage": f"/theme-{preset_id}.png",
                "renderTheme": preset_id,
            }
            for preset_id, preset in THEME_PRESETS.items()
        ]
        theme_ids = [*cls.THEME_ALIASES.keys(), *cls.AVAILABLE_THEMES]
        return presets + [
            {
                "id": theme_id,
                **cls.THEME_METADATA.get(
                    theme_id,
                    {
                        "name": theme_id.replace("_", " ").title(),
                        "description": "Built-in RenderCV theme.",
                        "bestFor": "Professional CVs",
                        "previewImage": f"/theme-{theme_id}.png",
                        "sectionOrderType": "standard",
                    },
                ),
            }
            for theme_id in theme_ids
        ]
    
    @classmethod
    def render_cv(
        cls,
        cv_data: dict,
        output_format: str = "png",
        theme: str = "classic",
        design_settings: dict | None = None,
        section_order: list[str] | None = None,
    ) -> tuple[bytes, str]:
        """Render the CV as a PDF, or as a PNG of the first page.

        Returns:
            Tuple of (file_bytes, filename).
        """
        full_data = cls._build_yaml_structure(cv_data, theme, design_settings, section_order)
        name = (cv_data.get("name") or "CV").replace(" ", "_")

        if output_format == "pdf":
            pdf_bytes, _ = cls._compile_cached(full_data, "pdf")
            return pdf_bytes, f"{name}_CV.pdf"

        pages, _ = cls._compile_cached(full_data, "png")
        return pages[0], f"{name}_CV.png"

    @classmethod
    def render_preview_pages(
        cls,
        cv_data: dict,
        theme: str = "classic",
        design_settings: dict | None = None,
        section_order: list[str] | None = None,
    ) -> "PreviewPages":
        """Render every page as PNG bytes, capped at PREVIEW_MAX_PAGES."""
        full_data = cls._build_yaml_structure(cv_data, theme, design_settings, section_order)
        pages, cached = cls._compile_cached(full_data, "png")
        max_pages = get_settings().preview_max_pages
        return PreviewPages(pages=pages[:max_pages], page_count=len(pages), cached=cached)

    @classmethod
    def render_thumbnail(
        cls,
        cv_data: dict,
        theme: str = "classic",
        design_settings: dict | None = None,
        section_order: list[str] | None = None,
        ppi: float = THUMBNAIL_PPI,
    ) -> bytes:
        """First page as a small PNG, for template galleries."""
        full_data = cls._build_yaml_structure(cv_data, theme, design_settings, section_order)
        pages, _ = cls._compile_cached(full_data, "png", ppi=ppi)
        return pages[0]

    @classmethod
    def _compile_cached(cls, full_data: dict, output_format: str, ppi: float | None = None) -> tuple[Any, bool]:
        """Compile RenderCV data, reusing a previous result for identical input.

        Today's date is part of the key because RenderCV resolves "present"
        and the last-updated note against the current date.
        """
        key = render_cache.key_for(full_data, output_format, ppi, datetime.date.today().isoformat())
        cached = render_cache.get(key)
        if cached is not None:
            return cached, True

        typst_source = cls._typst_source(full_data)
        result = _compile_typst(typst_source, output_format, ppi)
        render_cache.set(key, result)
        return result, False

    @staticmethod
    def _typst_source(full_data: dict) -> str:
        """Validate data with RenderCV and render its Typst template."""
        yaml_text = yaml.dump(full_data, allow_unicode=True, default_flow_style=False, sort_keys=False)
        try:
            with _rendercv_parse_lock:
                _, model = build_rendercv_dictionary_and_model(yaml_text)
        except RenderCVUserValidationError as error:
            raise RenderValidationError(
                "Some CV fields have values the renderer can't use.",
                fields=_validation_fields(error),
            ) from error
        except RenderCVUserError as error:
            raise RenderValidationError(error.message or "The CV content could not be rendered.") from error
        return render_full_template(model, "typst")

    @classmethod
    def generate_yaml(
        cls,
        cv_data: dict,
        theme: str = "classic",
        design_settings: dict | None = None,
        section_order: list[str] | None = None,
    ) -> str:
        """Generate the RenderCV YAML string for a CV payload."""
        full_data = cls._build_yaml_structure(
            cv_data=cv_data,
            theme=theme,
            design_settings=design_settings,
            section_order=section_order,
        )
        return yaml.dump(
            full_data,
            allow_unicode=True,
            default_flow_style=False,
            sort_keys=False,
        )
    
    @classmethod
    def _build_yaml_structure(
        cls,
        cv_data: dict,
        theme: str,
        design_settings: dict = None,
        section_order: list = None,
    ) -> dict:
        """Build complete YAML structure from simplified CV data."""
        
        def normalize_url(url: str) -> str:
            """Normalize and validate URL. Returns empty string if invalid."""
            if not url or not url.strip():
                return ""
            url = url.strip()
            # Skip obviously invalid URLs
            if ',' in url or ' ' in url:
                return ""
            # Add https:// if no protocol
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            # Basic validation - must have at least one dot and no spaces
            if '.' not in url:
                return ""
            return url

        def display_url(url: str) -> str:
            """Return a compact URL label suitable for a CV link."""
            return re.sub(r"^https?://", "", url).removeprefix("www.").rstrip("/")

        def with_project_link(highlights: list[str], normalized_url: str) -> list[str]:
            """Expose project URLs in templates that do not render arbitrary URL fields."""
            if not normalized_url:
                return highlights

            url_label = display_url(normalized_url)
            existing_text = "\n".join(highlights).lower()
            if normalized_url.lower() in existing_text or url_label.lower() in existing_text:
                return highlights

            return [f"Live demo: [{url_label}]({normalized_url})", *highlights]

        def clean_string(value: object) -> str:
            """Return a trimmed string for optional text fields."""
            return str(value or "").strip()

        def normalize_phone(value: object, location_value: str = "") -> str:
            """Return a RenderCV-valid phone number or omit it.

            Uploaded PDFs often contain local numbers such as 03001234567.
            RenderCV validates phone numbers strictly, so keep valid values,
            infer Pakistan local mobile numbers when the location says Pakistan,
            and otherwise omit invalid phone text instead of failing preview.
            """
            phone_value = clean_string(value)
            if not phone_value:
                return ""

            candidates = [phone_value]
            digits = re.sub(r"\D", "", phone_value)
            if (
                "pakistan" in location_value.lower()
                and re.fullmatch(r"03\d{9}", digits)
            ):
                candidates.insert(0, f"+92{digits[1:]}")
            if phone_value.startswith("00"):
                candidates.append(f"+{phone_value[2:]}")

            for candidate in candidates:
                try:
                    _PHONE_VALIDATOR.validate_python(candidate)
                    return candidate
                except Exception:
                    continue

            return ""

        def compact_entry(entry: dict) -> dict:
            """Remove empty values while preserving meaningful lists and booleans."""
            compacted = {}
            for key, value in entry.items():
                if isinstance(value, str):
                    if value.strip():
                        compacted[key] = value.strip()
                elif isinstance(value, list):
                    cleaned_list = [
                        item.strip() if isinstance(item, str) else item
                        for item in value
                        if not isinstance(item, str) or item.strip()
                    ]
                    if cleaned_list:
                        compacted[key] = cleaned_list
                elif value is not None:
                    compacted[key] = value
            return compacted

        def split_lines(value: object) -> list[str]:
            """Convert textarea-style content to RenderCV highlights."""
            if isinstance(value, list):
                return [clean_string(item) for item in value if clean_string(item)]
            return [line.strip() for line in str(value or "").splitlines() if line.strip()]

        def split_authors(value: object) -> list[str]:
            """Normalize publication authors from comma-separated text or a list."""
            if isinstance(value, list):
                return [clean_string(author) for author in value if clean_string(author)]
            return [author.strip() for author in str(value or "").split(",") if author.strip()]

        def normalize_date(value: object, allow_present: bool = False) -> str:
            """Normalize common editor date input to RenderCV's accepted date forms."""
            date_value = clean_string(value)
            if not date_value:
                return ""
            if allow_present and date_value.lower() == "present":
                return "present"
            if re.fullmatch(r"\d{4}", date_value) or re.fullmatch(r"\d{4}-\d{2}", date_value):
                return date_value

            month_lookup = {
                "jan": "01", "january": "01",
                "feb": "02", "february": "02",
                "mar": "03", "march": "03",
                "apr": "04", "april": "04",
                "may": "05",
                "jun": "06", "june": "06",
                "jul": "07", "july": "07",
                "aug": "08", "august": "08",
                "sep": "09", "sept": "09", "september": "09",
                "oct": "10", "october": "10",
                "nov": "11", "november": "11",
                "dec": "12", "december": "12",
            }
            match = re.fullmatch(r"([A-Za-z]+)\s+(\d{4})", date_value)
            if match:
                month = month_lookup.get(match.group(1).lower())
                if month:
                    return f"{match.group(2)}-{month}"

            return ""
        
        # Extract personal info (ensure all are strings)
        name = str(cv_data.get("name", "") or "").strip()
        headline = str(cv_data.get("headline", "") or "")
        email = str(cv_data.get("email", "") or "")
        location = str(cv_data.get("location", "") or "")
        phone = normalize_phone(cv_data.get("phone", ""), location)
        website = normalize_url(str(cv_data.get("website", "") or ""))
        linkedin = str(cv_data.get("linkedin", "") or "")
        github = str(cv_data.get("github", "") or "")
        
        # Build social networks
        social_networks = []
        if linkedin:
            social_networks.append({"network": "LinkedIn", "username": linkedin})
        if github:
            social_networks.append({"network": "GitHub", "username": github})
        
        # Build CV section - use rendercv v2.x field names
        cv_section = {
            "name": name or "Your Name",
        }
        
        if headline:
            cv_section["headline"] = headline
        if email:
            cv_section["email"] = email
        if phone:
            cv_section["phone"] = phone
        if location:
            cv_section["location"] = location
        if website:
            cv_section["website"] = website
        if social_networks:
            cv_section["social_networks"] = social_networks
        
        # Build sections in a staging map first. Ordering is applied after all
        # renderable sections have been normalized.
        available_sections = {}
        
        # Summary section - rendercv v2.x uses simple text sections.
        summary = clean_string(cv_data.get("summary"))
        if summary:
            available_sections["Summary"] = [summary]
        
        # Experience section
        experience = cv_data.get("experience", [])
        if experience:
            exp_entries = []
            for exp in experience:
                if not clean_string(exp.get("company")) or not clean_string(exp.get("position")):
                    continue
                entry = {
                    "company": exp.get("company", ""),
                    "position": exp.get("position", ""),
                    "date": normalize_date(exp.get("date")),
                    "start_date": normalize_date(exp.get("start_date")),
                    "end_date": normalize_date(exp.get("end_date"), allow_present=True),
                    "location": exp.get("location", ""),
                    "summary": exp.get("summary", ""),
                    "highlights": split_lines(exp.get("highlights")),
                }
                exp_entries.append(compact_entry(entry))
            
            if exp_entries:
                available_sections["experience"] = exp_entries
        
        # Education section
        education = cv_data.get("education", [])
        if education:
            edu_entries = []
            for edu in education:
                if not clean_string(edu.get("institution")) or not clean_string(edu.get("area")):
                    continue
                entry = {
                    "institution": edu.get("institution", ""),
                    "area": edu.get("area", ""),
                    "degree": edu.get("degree", ""),
                    "date": normalize_date(edu.get("date")),
                    "start_date": normalize_date(edu.get("start_date")),
                    "end_date": normalize_date(edu.get("end_date"), allow_present=True),
                    "location": edu.get("location", ""),
                    "summary": edu.get("summary", ""),
                    "highlights": split_lines(edu.get("highlights")),
                }
                edu_entries.append(compact_entry(entry))
            
            if edu_entries:
                available_sections["education"] = edu_entries
        
        # Skills section
        skills = cv_data.get("skills", [])
        if skills:
            skill_entries = []
            for skill in skills:
                if skill.get("label") and skill.get("details"):
                    skill_entries.append(compact_entry({
                        "label": skill.get("label"),
                        "details": skill.get("details"),
                    }))
            if skill_entries:
                available_sections["skills"] = skill_entries
        
        # Projects section
        projects = cv_data.get("projects", [])
        if projects:
            proj_entries = []
            for proj in projects:
                if not clean_string(proj.get("name")):
                    continue
                entry = {
                    "name": proj.get("name", ""),
                    "date": normalize_date(proj.get("date")),
                    "start_date": normalize_date(proj.get("start_date")),
                    "end_date": normalize_date(proj.get("end_date"), allow_present=True),
                    "location": proj.get("location", ""),
                    "summary": proj.get("summary", ""),
                    "highlights": split_lines(proj.get("highlights")),
                }
                
                if proj.get("url"):
                    normalized_url = normalize_url(proj.get("url", ""))
                    if normalized_url:
                        entry["highlights"] = with_project_link(
                            entry["highlights"],
                            normalized_url,
                        )
                        entry["url"] = normalized_url
                
                proj_entries.append(compact_entry(entry))
            
            if proj_entries:
                available_sections["projects"] = proj_entries
        
        # Publications section
        publications = cv_data.get("publications", [])
        if publications:
            pub_entries = []
            for pub in publications:
                if not clean_string(pub.get("title")) or not split_authors(pub.get("authors")):
                    continue
                entry = {
                    "title": pub.get("title", ""),
                    "authors": split_authors(pub.get("authors")),
                    "journal": pub.get("journal", ""),
                    "date": normalize_date(pub.get("date")),
                    "doi": pub.get("doi", ""),
                    "summary": pub.get("summary", ""),
                }
                if pub.get("url"):
                    normalized_url = normalize_url(pub.get("url", ""))
                    if normalized_url:
                        entry["url"] = normalized_url
                
                pub_entries.append(compact_entry(entry))
            
            if pub_entries:
                available_sections["publications"] = pub_entries

        honors = cv_data.get("honors", [])
        if honors:
            honor_entries = [
                compact_entry({"bullet": honor.get("bullet", "")})
                for honor in honors
                if clean_string(honor.get("bullet"))
            ]
            if honor_entries:
                available_sections["selected_honors"] = honor_entries

        patents = cv_data.get("patents", [])
        if patents:
            patent_entries = [
                compact_entry({"number": patent.get("number", "")})
                for patent in patents
                if clean_string(patent.get("number"))
            ]
            if patent_entries:
                available_sections["patents"] = patent_entries

        talks = cv_data.get("talks", [])
        if talks:
            talk_entries = [
                compact_entry({"reversed_number": talk.get("reversed_number", "")})
                for talk in talks
                if clean_string(talk.get("reversed_number"))
            ]
            if talk_entries:
                available_sections["invited_talks"] = talk_entries

        section_key_map = {
            "summary": "Summary",
            "experience": "experience",
            "education": "education",
            "skills": "skills",
            "projects": "projects",
            "publications": "publications",
            "honors": "selected_honors",
            "selected_honors": "selected_honors",
            "patents": "patents",
            "talks": "invited_talks",
            "invited_talks": "invited_talks",
        }

        design_settings = design_settings or {}

        for hidden_id in design_settings.get("hiddenSections") or []:
            available_sections.pop(section_key_map.get(hidden_id, hidden_id), None)

        # A CV's own section order wins over the theme's order. Only a custom
        # order may move the summary; theme orders always keep it first.
        custom_order = design_settings.get("sectionOrder") or None
        ordered_section_ids = custom_order or section_order or []

        ordered_sections = {}
        summary_listed = custom_order is not None and "summary" in custom_order
        if "Summary" in available_sections and not summary_listed:
            ordered_sections["Summary"] = available_sections["Summary"]

        for section_id in ordered_section_ids:
            rendercv_key = section_key_map.get(section_id, section_id)
            if rendercv_key == "Summary" and not summary_listed:
                continue
            if rendercv_key in available_sections and rendercv_key not in ordered_sections:
                ordered_sections[rendercv_key] = available_sections[rendercv_key]

        for rendercv_key, entries in available_sections.items():
            if rendercv_key not in ordered_sections:
                ordered_sections[rendercv_key] = entries
        
        # Add sections to CV
        if ordered_sections:
            cv_section["sections"] = ordered_sections
        
        preset = THEME_PRESETS.get(theme)
        if preset:
            # Preset font/colour apply unless the CV sets its own.
            design_settings = {**preset["defaults"], **{k: v for k, v in design_settings.items() if v not in (None, "")}}
        design = {
            "theme": cls.resolve_theme(theme),
        }

        primary_color = clean_string(design_settings.get("primaryColor"))
        if primary_color:
            accent_targets = (preset or {}).get(
                "accent_targets", ["name", "headline", "connections", "section_titles", "links"]
            )
            design["colors"] = {target: primary_color for target in accent_targets}

        typography: dict = {}
        font_family = clean_string(design_settings.get("fontFamily"))
        if font_family:
            font_targets = (preset or {}).get("font_targets")
            typography["font_family"] = {target: font_family for target in font_targets} if font_targets else font_family
        if design_settings.get("fontSizePt"):
            typography["font_size"] = {"body": f"{float(design_settings['fontSizePt']):g}pt"}
        if design_settings.get("lineSpacingEm"):
            typography["line_spacing"] = f"{float(design_settings['lineSpacingEm']):g}em"
        if typography:
            design["typography"] = typography

        page: dict = {}
        if design_settings.get("pageSize"):
            page["size"] = design_settings["pageSize"]
        if design_settings.get("marginCm"):
            margin = f"{float(design_settings['marginCm']):g}cm"
            page.update(top_margin=margin, bottom_margin=margin, left_margin=margin, right_margin=margin)
        if design_settings.get("showFooter") is not None:
            page["show_footer"] = bool(design_settings["showFooter"])
        if page:
            design["page"] = page

        if design_settings.get("sectionSpacingCm"):
            design["section_titles"] = {"space_above": f"{float(design_settings['sectionSpacingCm']):g}cm"}

        if preset:
            # The preset recipe is the base; the CV's own choices override it.
            design = merge(preset["design"], design)
        
        # Build final structure
        return {
            "cv": cv_section,
            "design": design
        }
