"""
CV Rendering Service.

Wraps RenderCV core functionality for web API use.
Uses the rendercv CLI for rendering since the PyPI package is CLI-based.
"""

import tempfile
import shutil
import subprocess
import sys
import re
import os
from pathlib import Path
import yaml
import pydantic
import pydantic_extra_types.phone_numbers as pydantic_phone_numbers
from rendercv.schema.models.design.built_in_design import available_themes

_PHONE_VALIDATOR = pydantic.TypeAdapter[pydantic_phone_numbers.PhoneNumber](
    pydantic_phone_numbers.PhoneNumber
)


class CVService:
    """Service for rendering CVs from structured data."""
    
    THEME_METADATA = {
        "classic": {
            "name": "Classic Professional",
            "description": "Traditional professional layout with refined typography.",
            "bestFor": "Corporate, finance, legal, operations",
            "previewImage": "/theme-classic.png",
            "sectionOrderType": "standard",
        },
        "moderncv": {
            "name": "Modern Minimal",
            "description": "Modern structure with a clean, confident hierarchy.",
            "bestFor": "Product, design, marketing, startups",
            "previewImage": "/theme-moderncv.png",
            "sectionOrderType": "standard",
        },
        "sb2nov": {
            "name": "Academic Focus",
            "description": "Research-oriented layout optimized for dense detail.",
            "bestFor": "Academia, research, graduate applications",
            "previewImage": "/theme-sb2nov.png",
            "sectionOrderType": "academic",
        },
        "engineeringresumes": {
            "name": "Technical Precision",
            "description": "Engineering layout with strong scanability.",
            "bestFor": "Software, engineering, DevOps, data",
            "previewImage": "/theme-engineeringresumes.png",
            "sectionOrderType": "tech",
        },
        "engineeringclassic": {
            "name": "Entry Level",
            "description": "Education-first format for early-career candidates.",
            "bestFor": "Students, fresh graduates, career changers",
            "previewImage": "/theme-engineeringclassic.png",
            "sectionOrderType": "entry_level",
        },
        "ember": {
            "name": "Ember",
            "description": "Warm editorial styling with crisp professional spacing.",
            "bestFor": "Consulting, creative leadership, business roles",
            "previewImage": "/theme-ember.png",
            "sectionOrderType": "standard",
        },
        "harvard": {
            "name": "Harvard",
            "description": "Classic academic presentation with compact detail.",
            "bestFor": "Academic, policy, research, fellowships",
            "previewImage": "/theme-harvard.png",
            "sectionOrderType": "academic",
        },
        "ink": {
            "name": "Ink",
            "description": "High-contrast format with a strong editorial feel.",
            "bestFor": "Leadership, writing, strategy, creative roles",
            "previewImage": "/theme-ink.png",
            "sectionOrderType": "portfolio",
        },
        "opal": {
            "name": "Opal",
            "description": "Polished modern layout with refined visual rhythm.",
            "bestFor": "Senior professionals, product, technology",
            "previewImage": "/theme-opal.png",
            "sectionOrderType": "standard",
        },
    }
    AVAILABLE_THEMES = available_themes
    
    @classmethod
    def get_themes(cls) -> list[str]:
        """Return list of available themes."""
        return cls.AVAILABLE_THEMES

    @classmethod
    def get_theme_metadata(cls) -> list[dict]:
        """Return metadata for all available built-in themes."""
        return [
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
            for theme_id in cls.AVAILABLE_THEMES
        ]
    
    @classmethod
    def render_cv(
        cls,
        cv_data: dict,
        output_format: str = "png",
        theme: str = "classic",
        design_settings: dict = None,
        section_order: list = None,
    ) -> tuple[bytes, str]:
        """
        Render CV from structured data.
        
        Args:
            cv_data: Dictionary containing CV data (name, sections, etc.)
            output_format: 'pdf' or 'png'
            theme: Theme name
            design_settings: Optional design customization (colors, fonts)
            
        Returns:
            Tuple of (file_bytes, filename)
        """
        # Create temporary directory for rendering
        temp_dir = Path(tempfile.mkdtemp(prefix="rendercv_"))
        
        try:
            # Build full YAML structure
            full_data = cls._build_yaml_structure(
                cv_data,
                theme,
                design_settings,
                section_order,
            )
            
            # Write YAML file - sort_keys=False is CRITICAL to preserve section order!
            yaml_path = temp_dir / "cv.yaml"
            with open(yaml_path, "w", encoding="utf-8") as f:
                yaml.dump(full_data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
            
            # Use rendercv CLI via python -m to render
            output_dir = temp_dir / "output"
            render_env = {
                **os.environ,
                "PYTHONIOENCODING": "utf-8",
            }
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rendercv",
                    "render",
                    str(yaml_path),
                    "--output-folder",
                    str(output_dir),
                    "--quiet",
                ],
                capture_output=True,
                text=True,
                env=render_env,
                timeout=120
            )
            
            if result.returncode != 0:
                # Read the generated YAML for debugging
                yaml_content = yaml_path.read_text()[:500] if yaml_path.exists() else "YAML file not found"
                raise ValueError(f"RenderCV failed (code {result.returncode}): stdout={result.stdout[:2000]}, stderr={result.stderr[:500]}, yaml={yaml_content}")
            
            name = cv_data.get('name', 'CV').replace(' ', '_')
            
            # RenderCV creates output in a subdirectory - check multiple locations
            search_dirs = [output_dir, temp_dir]
            
            # Find generated files
            if output_format == "pdf":
                for search_dir in search_dirs:
                    pdf_files = list(search_dir.glob("**/*.pdf"))
                    if pdf_files:
                        return pdf_files[0].read_bytes(), f"{name}_CV.pdf"
            else:
                for search_dir in search_dirs:
                    png_files = sorted(search_dir.glob("**/*.png"))
                    if png_files:
                        return png_files[0].read_bytes(), f"{name}_CV.png"
            
            # Debug: list all files in temp_dir for troubleshooting
            all_files = list(temp_dir.glob("**/*"))
            file_list = [str(f.relative_to(temp_dir)) for f in all_files if f.is_file()]
            raise ValueError(f"Failed to generate output. Files found: {file_list}, stdout: {result.stdout[:500]}")
            
        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

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

        ordered_sections = {}
        if "Summary" in available_sections:
            ordered_sections["Summary"] = available_sections["Summary"]

        ordered_section_ids = section_order or []
        ordered_rendercv_keys = [
            section_key_map.get(section_id, section_id)
            for section_id in ordered_section_ids
        ]

        for index, section_id in enumerate(ordered_section_ids):
            rendercv_key = section_key_map.get(section_id, section_id)
            if rendercv_key == "Summary":
                continue
            if rendercv_key in available_sections and rendercv_key not in ordered_sections:
                ordered_sections[rendercv_key] = available_sections[rendercv_key]

        for rendercv_key, entries in available_sections.items():
            if rendercv_key not in ordered_sections:
                ordered_sections[rendercv_key] = entries
        
        # Add sections to CV
        if ordered_sections:
            cv_section["sections"] = ordered_sections
        
        design = {
            "theme": theme,
        }

        design_settings = design_settings or {}
        primary_color = clean_string(design_settings.get("primaryColor"))
        if primary_color:
            design["colors"] = {
                "name": primary_color,
                "headline": primary_color,
                "connections": primary_color,
                "section_titles": primary_color,
                "links": primary_color,
            }

        font_family = clean_string(design_settings.get("fontFamily"))
        if font_family:
            design["typography"] = {
                "font_family": font_family,
            }
        
        # Build final structure
        return {
            "cv": cv_section,
            "design": design
        }
