"""
CV Rendering Service.

Wraps RenderCV core functionality for web API use.
Handles temporary file management and cleanup.
"""

import tempfile
import shutil
from pathlib import Path
import yaml

# Import RenderCV modules
from rendercv.renderer.typst import generate_typst
from rendercv.renderer.pdf_png import generate_pdf, generate_png
from rendercv.schema.rendercv_model_builder import build_rendercv_dictionary_and_model


class CVService:
    """Service for rendering CVs from structured data."""
    
    AVAILABLE_THEMES = ["classic", "moderncv", "sb2nov", "engineeringresumes", "engineeringclassic"]
    
    @classmethod
    def get_themes(cls) -> list[str]:
        """Return list of available themes."""
        return cls.AVAILABLE_THEMES
    
    @classmethod
    def render_cv(
        cls,
        cv_data: dict,
        output_format: str = "png",
        theme: str = "classic",
        design_settings: dict = None,
        section_order: list = None
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
            full_data = cls._build_yaml_structure(cv_data, theme, design_settings, section_order)
            
            # Write YAML file - sort_keys=False is CRITICAL to preserve section order!
            yaml_path = temp_dir / "cv.yaml"
            with open(yaml_path, "w", encoding="utf-8") as f:
                yaml.dump(full_data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
            
            # Build model from YAML file
            _, rendercv_model = build_rendercv_dictionary_and_model(yaml_path)
            
            # Generate Typst file
            typst_path = generate_typst(rendercv_model)
            
            if typst_path is None:
                raise ValueError("Failed to generate Typst file")
            
            name = cv_data.get('name', 'CV').replace(' ', '_')
            
            if output_format == "pdf":
                # Generate PDF
                pdf_path = generate_pdf(rendercv_model, typst_path)
                if pdf_path and pdf_path.exists():
                    return pdf_path.read_bytes(), f"{name}_CV.pdf"
            else:
                # Generate PNG (first page only for preview)
                png_paths = generate_png(rendercv_model, typst_path)
                if png_paths and len(png_paths) > 0:
                    return png_paths[0].read_bytes(), f"{name}_CV.png"
            
            raise ValueError("Failed to generate output")
            
        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)
    
    @classmethod
    def _build_yaml_structure(cls, cv_data: dict, theme: str, design_settings: dict = None, section_order: list = None) -> dict:
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
        
        # Extract personal info (ensure all are strings)
        name = str(cv_data.get("name", "") or "").strip()
        headline = str(cv_data.get("headline", "") or "")
        email = str(cv_data.get("email", "") or "")
        phone = str(cv_data.get("phone", "") or "")  # Ensure phone is string
        location = str(cv_data.get("location", "") or "")
        website = normalize_url(str(cv_data.get("website", "") or ""))
        linkedin = str(cv_data.get("linkedin", "") or "")
        github = str(cv_data.get("github", "") or "")
        
        # Build social networks
        social_networks = []
        if linkedin:
            social_networks.append({"network": "LinkedIn", "username": linkedin})
        if github:
            social_networks.append({"network": "GitHub", "username": github})
        # Build sections - we'll collect them in proper industrial CV order at the end
        # The order is: Summary → Experience → Education → Projects → Skills → Publications → Honors → Patents → Talks
        
        section_summary = None
        section_experience = None
        section_education = None
        section_projects = None
        section_skills = None
        section_publications = None
        section_honors = None
        section_patents = None
        section_talks = None
        
        # Summary section
        if cv_data.get("summary") and cv_data["summary"].strip():
            section_summary = [cv_data["summary"].strip()]
        
        # Experience section
        if cv_data.get("experience"):
            experience_list = []
            for exp in cv_data["experience"]:
                # Skip entries without meaningful company/position
                company = str(exp.get("company", "") or "").strip()
                position = str(exp.get("position", "") or "").strip()
                if not company and not position:
                    continue
                entry = {
                    "company": company or "Company",
                    "position": position or "Position",
                }
                if exp.get("start_date"):
                    entry["start_date"] = exp["start_date"]
                if exp.get("end_date"):
                    entry["end_date"] = exp["end_date"]
                if exp.get("location"):
                    entry["location"] = exp["location"]
                if exp.get("summary"):
                    entry["summary"] = exp["summary"]
                # Filter out empty highlights
                highlights = [h for h in exp.get("highlights", []) if h and h.strip()]
                if highlights:
                    entry["highlights"] = highlights
                experience_list.append(entry)
            if experience_list:
                section_experience = experience_list
        
        # Education section
        if cv_data.get("education"):
            education_list = []
            for edu in cv_data["education"]:
                # RenderCV requires both institution AND area for EducationEntry
                institution = str(edu.get("institution", "") or "").strip()
                area = str(edu.get("area", "") or "").strip()
                # Skip entries without required fields
                if not institution or not area:
                    continue
                entry = {"institution": institution, "area": area}
                if edu.get("degree"):
                    entry["degree"] = edu["degree"]
                if edu.get("start_date"):
                    entry["start_date"] = edu["start_date"]
                if edu.get("end_date"):
                    entry["end_date"] = edu["end_date"]
                if edu.get("location"):
                    entry["location"] = edu["location"]
                if edu.get("summary"):
                    entry["summary"] = edu["summary"]
                highlights = [h for h in edu.get("highlights", []) if h and h.strip()]
                if highlights:
                    entry["highlights"] = highlights
                education_list.append(entry)
            if education_list:
                section_education = education_list
        
        # Projects section
        if cv_data.get("projects"):
            projects_list = []
            for proj in cv_data["projects"]:
                # Skip entries without a meaningful name
                name = str(proj.get("name", "") or "").strip()
                if not name:
                    continue
                entry = {"name": name}
                if proj.get("date"):
                    entry["date"] = proj["date"]
                if proj.get("start_date"):
                    entry["start_date"] = proj["start_date"]
                if proj.get("end_date"):
                    entry["end_date"] = proj["end_date"]
                if proj.get("location"):
                    entry["location"] = proj["location"]
                if proj.get("url"):
                    # Format as markdown link if URL provided
                    entry["name"] = f"[{name}]({proj['url']})"
                if proj.get("summary"):
                    entry["summary"] = proj["summary"]
                highlights = [h for h in proj.get("highlights", []) if h and h.strip()]
                if highlights:
                    entry["highlights"] = highlights
                projects_list.append(entry)
            if projects_list:
                section_projects = projects_list
        
        # Skills section
        if cv_data.get("skills"):
            skills_list = [
                {"label": str(skill.get("label", "") or "").strip(), "details": str(skill.get("details", "") or "").strip()}
                for skill in cv_data["skills"]
                if str(skill.get("label", "") or "").strip() or str(skill.get("details", "") or "").strip()
            ]
            if skills_list:
                section_skills = skills_list
        
        # Publications section
        if cv_data.get("publications"):
            publications_list = []
            for pub in cv_data["publications"]:
                # RenderCV requires both title AND authors for PublicationEntry
                title = str(pub.get("title", "") or "").strip()
                if not title:
                    continue
                
                # Handle authors - can be string or list, REQUIRED field
                authors = pub.get("authors", [])
                author_list = []
                if isinstance(authors, str):
                    # Parse comma-separated string
                    author_list = [a.strip() for a in authors.split(",") if a.strip()]
                elif isinstance(authors, list):
                    author_list = [str(a).strip() for a in authors if str(a).strip()]
                
                # Skip if no authors provided
                if not author_list:
                    continue
                
                entry = {"title": title, "authors": author_list}
                
                if pub.get("journal"):
                    entry["journal"] = pub["journal"]
                if pub.get("date"):
                    entry["date"] = pub["date"]
                if pub.get("doi"):
                    entry["doi"] = pub["doi"]
                if pub.get("url"):
                    entry["url"] = pub["url"]
                if pub.get("summary"):
                    entry["summary"] = pub["summary"]
                    
                publications_list.append(entry)
            if publications_list:
                section_publications = publications_list
        
        # Honors section (selected_honors in RenderCV)
        if cv_data.get("honors"):
            honors_list = [
                {"bullet": str(h.get("bullet", "") or "").strip()}
                for h in cv_data["honors"]
                if str(h.get("bullet", "") or "").strip()
            ]
            if honors_list:
                section_honors = honors_list
        
        # Patents section
        if cv_data.get("patents"):
            patents_list = [
                {"number": str(p.get("number", "") or "").strip()}
                for p in cv_data["patents"]
                if str(p.get("number", "") or "").strip()
            ]
            if patents_list:
                section_patents = patents_list
        
        # Invited Talks section
        if cv_data.get("talks"):
            talks_list = [
                {"reversed_number": str(t.get("reversed_number", "") or "").strip()}
                for t in cv_data["talks"]
                if str(t.get("reversed_number", "") or "").strip()
            ]
            if talks_list:
                section_talks = talks_list
        
        # Map section IDs to their content and YAML keys
        section_map = {
            "summary": ("Summary", section_summary),
            "experience": ("experience", section_experience),
            "education": ("education", section_education),
            "projects": ("projects", section_projects),
            "skills": ("skills", section_skills),
            "publications": ("publications", section_publications),
            "honors": ("selected_honors", section_honors),
            "patents": ("patents", section_patents),
            "talks": ("invited_talks", section_talks),
        }
        
        # Default section order if not provided
        if not section_order:
            section_order = ["summary", "experience", "education", "projects", "skills", 
                           "publications", "honors", "patents", "talks"]
        
        # Build sections in the order specified by section_order
        sections = {}
        for section_id in section_order:
            if section_id in section_map:
                yaml_key, content = section_map[section_id]
                if content:  # Only add non-empty sections
                    sections[yaml_key] = content
        
        # Build final CV section
        cv_section = {}
        if name:
            cv_section["name"] = name
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
        if sections:
            cv_section["sections"] = sections
        
        # Build design section
        design = {"theme": theme}
        
        # Apply design settings if provided
        if design_settings:
            primary_color = design_settings.get("primaryColor")
            font_family = design_settings.get("fontFamily")
            
            if primary_color:
                design["colors"] = {
                    "name": primary_color,
                    "headline": primary_color,
                    "connections": primary_color,
                    "section_titles": primary_color,
                    "links": primary_color,
                }
            
            if font_family:
                design["typography"] = {
                    "font_family": {
                        "body": font_family,
                        "name": font_family,
                        "headline": font_family,
                        "connections": font_family,
                        "section_titles": font_family,
                    }
                }
        
        return {
            "cv": cv_section,
            "design": design
        }
    
    @classmethod
    def generate_yaml(cls, cv_data: dict, theme: str = "classic", design_settings: dict = None) -> str:
        """Generate YAML string from CV data."""
        full_data = cls._build_yaml_structure(cv_data, theme, design_settings)
        return yaml.dump(full_data, allow_unicode=True, default_flow_style=False, sort_keys=False)
