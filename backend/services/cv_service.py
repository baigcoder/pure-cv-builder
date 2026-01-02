"""
CV Rendering Service.

Wraps RenderCV core functionality for web API use.
Uses the rendercv CLI for rendering since the PyPI package is CLI-based.
"""

import tempfile
import shutil
import subprocess
from pathlib import Path
import yaml
import os


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
            
            # Use rendercv CLI via python -m to render
            output_dir = temp_dir / "output"
            result = subprocess.run(
                ["python", "-m", "rendercv", "render", str(yaml_path), "--output-folder-name", str(output_dir)],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode != 0:
                raise ValueError(f"RenderCV failed (code {result.returncode}): stdout={result.stdout[:500]}, stderr={result.stderr[:500]}")
            
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
        
        # Build CV section
        cv_section = {
            "name": name or "Your Name",
        }
        
        if headline:
            cv_section["label"] = headline
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
        
        # Build sections based on order
        sections = {}
        
        # Summary section
        summary = str(cv_data.get("summary", "") or "")
        if summary:
            sections["summary"] = [summary]
        
        # Experience section
        experience = cv_data.get("experience", [])
        if experience:
            exp_entries = []
            for exp in experience:
                if not exp.get("company"):
                    continue
                entry = {
                    "company": exp.get("company", ""),
                    "position": exp.get("title", ""),
                }
                
                # Handle dates
                start_date = exp.get("startDate", "")
                end_date = exp.get("endDate", "")
                if start_date:
                    entry["start_date"] = start_date
                if end_date:
                    entry["end_date"] = end_date
                elif exp.get("current"):
                    entry["end_date"] = "present"
                    
                if exp.get("location"):
                    entry["location"] = exp.get("location")
                    
                # Handle highlights/description
                description = exp.get("description", "")
                if description:
                    # Split by newlines for multiple highlights
                    highlights = [h.strip() for h in description.split('\n') if h.strip()]
                    if highlights:
                        entry["highlights"] = highlights
                
                exp_entries.append(entry)
            
            if exp_entries:
                sections["experience"] = exp_entries
        
        # Education section
        education = cv_data.get("education", [])
        if education:
            edu_entries = []
            for edu in education:
                if not edu.get("institution"):
                    continue
                entry = {
                    "institution": edu.get("institution", ""),
                    "area": edu.get("degree", ""),
                }
                
                start_date = edu.get("startDate", "")
                end_date = edu.get("endDate", "")
                if start_date:
                    entry["start_date"] = start_date
                if end_date:
                    entry["end_date"] = end_date
                    
                if edu.get("location"):
                    entry["location"] = edu.get("location")
                    
                highlights = []
                if edu.get("gpa"):
                    highlights.append(f"GPA: {edu.get('gpa')}")
                if edu.get("description"):
                    highlights.extend([h.strip() for h in edu.get("description", "").split('\n') if h.strip()])
                if highlights:
                    entry["highlights"] = highlights
                
                edu_entries.append(entry)
            
            if edu_entries:
                sections["education"] = edu_entries
        
        # Skills section
        skills = cv_data.get("skills", [])
        if skills:
            skill_entries = []
            for skill in skills:
                if skill.get("category") and skill.get("items"):
                    skill_entries.append({
                        "label": skill.get("category"),
                        "details": skill.get("items")
                    })
            if skill_entries:
                sections["technologies"] = skill_entries
        
        # Projects section
        projects = cv_data.get("projects", [])
        if projects:
            proj_entries = []
            for proj in projects:
                if not proj.get("name"):
                    continue
                entry = {
                    "name": proj.get("name", ""),
                }
                
                start_date = proj.get("startDate", "")
                end_date = proj.get("endDate", "")
                if start_date:
                    entry["start_date"] = start_date
                if end_date:
                    entry["end_date"] = end_date
                
                if proj.get("url"):
                    normalized_url = normalize_url(proj.get("url", ""))
                    if normalized_url:
                        entry["url"] = normalized_url
                
                description = proj.get("description", "")
                if description:
                    highlights = [h.strip() for h in description.split('\n') if h.strip()]
                    if highlights:
                        entry["highlights"] = highlights
                
                proj_entries.append(entry)
            
            if proj_entries:
                sections["projects"] = proj_entries
        
        # Publications section
        publications = cv_data.get("publications", [])
        if publications:
            pub_entries = []
            for pub in publications:
                if not pub.get("title"):
                    continue
                entry = {
                    "title": pub.get("title", ""),
                }
                if pub.get("authors"):
                    entry["authors"] = [a.strip() for a in pub.get("authors", "").split(',')]
                if pub.get("venue"):
                    entry["journal"] = pub.get("venue")
                if pub.get("date"):
                    entry["date"] = pub.get("date")
                if pub.get("url"):
                    normalized_url = normalize_url(pub.get("url", ""))
                    if normalized_url:
                        entry["url"] = normalized_url
                
                pub_entries.append(entry)
            
            if pub_entries:
                sections["publications"] = pub_entries
        
        # Add sections to CV
        if sections:
            cv_section["sections"] = sections
        
        # Build design section
        design = {
            "theme": theme,
        }
        
        if design_settings:
            if design_settings.get("primaryColor"):
                design["color"] = design_settings.get("primaryColor")
            if design_settings.get("fontFamily"):
                design["font"] = design_settings.get("fontFamily")
        
        # Build final structure
        return {
            "cv": cv_section,
            "design": design
        }
