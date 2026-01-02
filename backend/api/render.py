"""
API Routes for CV Rendering.

Endpoints:
- POST /render - Generate CV preview or PDF
- GET /themes - List available themes
- POST /yaml - Generate YAML from CV data
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from typing import Optional

from services.cv_service import CVService

router = APIRouter(tags=["render"])


# Request/Response Models

class ExperienceEntry(BaseModel):
    """Work experience entry."""
    company: str = ""
    position: str = ""
    start_date: str = ""
    end_date: str = "present"
    location: str = ""
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class EducationEntry(BaseModel):
    """Education entry."""
    institution: str = ""
    area: str = ""
    degree: str = ""
    start_date: str = ""
    end_date: str = ""
    location: str = ""
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class SkillEntry(BaseModel):
    """Skill entry."""
    label: str = ""
    details: str = ""


class ProjectEntry(BaseModel):
    """Project entry."""
    name: str = ""
    date: str = ""
    start_date: str = ""
    end_date: str = ""
    location: str = ""
    url: str = ""
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class PublicationEntry(BaseModel):
    """Publication entry."""
    title: str = ""
    authors: str | list[str] = ""  # Comma-separated string or list
    journal: str = ""
    date: str = ""
    doi: Optional[str] = None
    url: Optional[str] = None
    summary: Optional[str] = None


class HonorEntry(BaseModel):
    """Honor/Award entry (bullet format)."""
    bullet: str = ""


class PatentEntry(BaseModel):
    """Patent entry (numbered format)."""
    number: str = ""


class TalkEntry(BaseModel):
    """Invited talk entry (reversed numbered format)."""
    reversed_number: str = ""


class DesignSettings(BaseModel):
    """Design customization settings."""
    primaryColor: Optional[str] = None
    fontFamily: Optional[str] = None


class CVData(BaseModel):
    """Complete CV data model."""
    name: str = "Your Name"
    headline: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    website: str = ""
    linkedin: str = ""
    github: str = ""
    summary: str = ""
    experience: list[ExperienceEntry] = Field(default_factory=list)
    education: list[EducationEntry] = Field(default_factory=list)
    skills: list[SkillEntry] = Field(default_factory=list)
    projects: list[ProjectEntry] = Field(default_factory=list)
    publications: list[PublicationEntry] = Field(default_factory=list)
    honors: list[HonorEntry] = Field(default_factory=list)
    patents: list[PatentEntry] = Field(default_factory=list)
    talks: list[TalkEntry] = Field(default_factory=list)
    
    # Coerce phone to string since frontend may send numeric value
    @field_validator('phone', mode='before')
    @classmethod
    def coerce_phone_to_string(cls, v):
        return str(v) if v is not None else ""


class RenderRequest(BaseModel):
    """Request model for CV rendering."""
    cv_data: CVData
    theme: str = "classic"
    format: str = "png"  # 'png' or 'pdf'
    design_settings: Optional[DesignSettings] = None
    section_order: Optional[list[str]] = None  # Theme-specific section order


class YAMLResponse(BaseModel):
    """Response model for YAML generation."""
    yaml: str


# Endpoints

@router.get("/themes")
async def get_themes() -> dict:
    """Get list of available CV themes."""
    return {
        "themes": CVService.get_themes(),
        "default": "classic"
    }


@router.post("/render")
async def render_cv(request: RenderRequest) -> Response:
    """
    Render CV and return as image (PNG) or PDF.
    
    - **cv_data**: CV content (personal info, experience, education, etc.)
    - **theme**: Theme name (classic, moderncv, sb2nov, etc.)
    - **format**: Output format ('png' for preview, 'pdf' for download)
    - **design_settings**: Optional design customization (colors, fonts)
    """
    try:
        cv_dict = request.cv_data.model_dump()
        design_dict = request.design_settings.model_dump() if request.design_settings else None
        file_bytes, filename = CVService.render_cv(
            cv_data=cv_dict,
            output_format=request.format,
            theme=request.theme,
            design_settings=design_dict,
            section_order=request.section_order
        )
        
        if request.format == "pdf":
            media_type = "application/pdf"
        else:
            media_type = "image/png"
        
        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/yaml")
async def generate_yaml(request: RenderRequest) -> YAMLResponse:
    """
    Generate YAML representation of CV data.
    
    Returns the YAML that would be used to render the CV.
    """
    try:
        cv_dict = request.cv_data.model_dump()
        design_dict = request.design_settings.model_dump() if request.design_settings else None
        yaml_str = CVService.generate_yaml(cv_dict, request.theme, design_dict)
        return YAMLResponse(yaml=yaml_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview")
async def preview_cv(request: RenderRequest) -> Response:
    """
    Generate PNG preview of CV (alias for render with format=png).
    """
    request.format = "png"
    return await render_cv(request)


@router.post("/download")
async def download_cv(request: RenderRequest) -> Response:
    """
    Download CV as PDF (alias for render with format=pdf).
    """
    request.format = "pdf"
    return await render_cv(request)


# --- AI Suggestion Endpoints ---

class AISuggestRequest(BaseModel):
    """Request model for AI suggestions."""
    text: str
    context: Optional[str] = ""
    type: str = "summary"  # summary, bullet, skills, generate


class AISuggestResponse(BaseModel):
    """Response model for AI suggestions."""
    suggestion: str
    suggestions: Optional[list[str]] = None


@router.post("/ai/suggest")
async def ai_suggest(request: AISuggestRequest) -> AISuggestResponse:
    """
    Get AI-powered suggestions for CV content.
    
    Types:
    - summary: Improve a professional summary
    - headline: Generate a professional headline
    - bullet: Improve an experience bullet point
    - education: Improve education highlight
    - project_summary: Improve project description
    - project_highlight: Improve project bullet
    - skills: Suggest additional skills
    - generate: Generate a summary from scratch
    - honor: Format an honor/award entry
    """
    from services.ai_service import AIService
    
    try:
        if request.type == "summary":
            result = AIService.improve_summary(request.text, request.context)
            return AISuggestResponse(suggestion=result)
        
        elif request.type == "headline":
            result = AIService.generate_headline(request.text, request.context)
            return AISuggestResponse(suggestion=result)
        
        elif request.type == "bullet":
            result = AIService.improve_experience_bullet(request.text, request.context)
            return AISuggestResponse(suggestion=result)
        
        elif request.type == "education":
            result = AIService.improve_education_highlight(request.text, request.context)
            return AISuggestResponse(suggestion=result)
        
        elif request.type == "project_summary":
            result = AIService.improve_project_summary(request.text, request.context)
            return AISuggestResponse(suggestion=result)
        
        elif request.type == "project_highlight":
            result = AIService.improve_project_highlight(request.text, request.context)
            return AISuggestResponse(suggestion=result)
        
        elif request.type == "skills":
            skills = AIService.suggest_skills(request.context or "Professional", request.text.split(","))
            return AISuggestResponse(suggestion=", ".join(skills), suggestions=skills)
        
        elif request.type == "generate":
            result = AIService.generate_summary(request.text, request.context)
            return AISuggestResponse(suggestion=result)
        
        elif request.type == "honor":
            result = AIService.generate_honor_entry(request.text)
            return AISuggestResponse(suggestion=result)
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown suggestion type: {request.type}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
