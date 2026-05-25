"""
API Routes for CV Rendering.

Endpoints:
- POST /render - Generate CV preview or PDF
- GET /themes - List available themes
- POST /yaml - Generate YAML from CV data
- POST /extract-pdf - Extract CV data from an uploaded PDF
"""

import logging
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from slowapi import Limiter
from slowapi.util import get_remote_address

from services.cv_service import CVService
from services.cover_letter_service import CoverLetterService
from services.pdf_extract_service import PDFExtractService

logger = logging.getLogger(__name__)

# Rate limiter instance
limiter = Limiter(key_func=get_remote_address)

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


class CoverLetterData(BaseModel):
    """Cover letter target details and editable output."""
    target_role: str = Field(..., min_length=2, max_length=120)
    company: str = Field(default="", max_length=120)
    hiring_manager: str = Field(default="", max_length=120)
    job_description: str = Field(..., min_length=40, max_length=12000)
    tone: str = Field(default="professional", max_length=40)
    letter: str = Field(default="", max_length=8000)

    @field_validator("target_role", "company", "hiring_manager", "job_description", "tone", "letter")
    @classmethod
    def strip_cover_letter_text(cls, value: str) -> str:
        return value.strip()


class CoverLetterRequest(BaseModel):
    """Request model for cover letter generation and export."""
    cv_data: CVData
    cover_letter: CoverLetterData
    ai_only: bool = False


class CoverLetterResponse(BaseModel):
    """Response model for generated cover letters."""
    letter: str
    source: str
    word_count: int


# Endpoints

@router.get("/themes")
@limiter.limit("30/minute")
async def get_themes(request: Request) -> dict:
    """Get list of available CV themes."""
    return {
        "themes": CVService.get_theme_metadata(),
        "default": "classic"
    }


@router.post("/render")
@limiter.limit("10/minute")
async def render_cv(request: Request, render_request: RenderRequest) -> Response:
    """
    Render CV and return as image (PNG) or PDF.
    
    - **cv_data**: CV content (personal info, experience, education, etc.)
    - **theme**: Theme name (classic, moderncv, sb2nov, etc.)
    - **format**: Output format ('png' for preview, 'pdf' for download)
    - **design_settings**: Optional design customization (colors, fonts)
    """
    try:
        cv_dict = render_request.cv_data.model_dump()
        design_dict = render_request.design_settings.model_dump() if render_request.design_settings else None
        file_bytes, filename = CVService.render_cv(
            cv_data=cv_dict,
            output_format=render_request.format,
            theme=render_request.theme,
            design_settings=design_dict,
            section_order=render_request.section_order,
        )
        
        if render_request.format == "pdf":
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
@limiter.limit("10/minute")
async def generate_yaml(request: Request, render_request: RenderRequest) -> YAMLResponse:
    """
    Generate YAML representation of CV data.
    
    Returns the YAML that would be used to render the CV.
    """
    try:
        cv_dict = render_request.cv_data.model_dump()
        design_dict = render_request.design_settings.model_dump() if render_request.design_settings else None
        yaml_str = CVService.generate_yaml(
            cv_dict,
            render_request.theme,
            design_dict,
            render_request.section_order,
        )
        return YAMLResponse(yaml=yaml_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview")
@limiter.limit("10/minute")
async def preview_cv(request: Request, render_request: RenderRequest) -> Response:
    """
    Generate PNG preview of CV (alias for render with format=png).
    """
    render_request.format = "png"
    return await render_cv(request, render_request)


@router.post("/download")
@limiter.limit("10/minute")
async def download_cv(request: Request, render_request: RenderRequest) -> Response:
    """
    Download CV as PDF (alias for render with format=pdf).
    """
    render_request.format = "pdf"
    return await render_cv(request, render_request)


@router.post("/cover-letter/generate")
@limiter.limit("10/minute")
async def generate_cover_letter(
    request: Request,
    cover_letter_request: CoverLetterRequest,
) -> CoverLetterResponse:
    """Generate a tailored cover letter from CV data and a job description."""
    from services.ai_service import AIService

    cv_dict = cover_letter_request.cv_data.model_dump()
    cover_letter = cover_letter_request.cover_letter

    if cover_letter_request.ai_only and not AIService.is_configured():
        raise HTTPException(
            status_code=503,
            detail="AI cover letter generation is not configured. Set OPENCODE_API_KEY to enable AI generation.",
        )

    source = "template"
    letter_text = ""
    if AIService.is_configured():
        letter_text = AIService.generate_cover_letter(
            cv_data=cv_dict,
            target_role=cover_letter.target_role,
            company=cover_letter.company,
            hiring_manager=cover_letter.hiring_manager,
            job_description=cover_letter.job_description,
            tone=cover_letter.tone,
        )
        source = "ai" if letter_text.strip() else "template"

    if not letter_text.strip():
        if cover_letter_request.ai_only:
            raise HTTPException(
                status_code=503,
                detail="AI cover letter generation is temporarily unavailable. Please try again.",
            )
        letter_text = CoverLetterService.build_fallback_letter(
            cv_data=cv_dict,
            target_role=cover_letter.target_role,
            company=cover_letter.company,
            hiring_manager=cover_letter.hiring_manager,
            job_description=cover_letter.job_description,
            tone=cover_letter.tone,
        )
        source = "template"

    letter_text = CoverLetterService.normalize_letter_spacing(letter_text)
    return CoverLetterResponse(
        letter=letter_text,
        source=source,
        word_count=CoverLetterService.word_count(letter_text),
    )


@router.post("/cover-letter/download")
@limiter.limit("10/minute")
async def download_cover_letter(
    request: Request,
    cover_letter_request: CoverLetterRequest,
) -> Response:
    """Download the edited cover letter as a simple ATS-friendly PDF."""
    cv_dict = cover_letter_request.cv_data.model_dump()
    cover_letter = cover_letter_request.cover_letter
    letter_text = cover_letter.letter or CoverLetterService.build_fallback_letter(
        cv_data=cv_dict,
        target_role=cover_letter.target_role,
        company=cover_letter.company,
        hiring_manager=cover_letter.hiring_manager,
        job_description=cover_letter.job_description,
        tone=cover_letter.tone,
    )
    pdf_bytes = CoverLetterService.render_pdf(
        cv_data=cv_dict,
        letter_text=CoverLetterService.normalize_letter_spacing(letter_text),
    )
    safe_name = (cv_dict.get("name") or "Cover_Letter").replace(" ", "_")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}_Cover_Letter.pdf"'
        },
    )


# --- AI Suggestion Endpoints ---

class AISuggestRequest(BaseModel):
    """Request model for AI suggestions."""
    text: str = Field(default="", max_length=8000)
    context: Optional[str] = ""
    type: Literal[
        "summary",
        "headline",
        "bullet",
        "education",
        "project_summary",
        "project_highlight",
        "skills",
        "generate",
        "honor",
    ] = "summary"

    @field_validator("text", "context")
    @classmethod
    def strip_ai_text(cls, value: str | None) -> str:
        return value.strip() if value else ""


class AISuggestResponse(BaseModel):
    """Response model for AI suggestions."""
    suggestion: str
    suggestions: Optional[list[str]] = None
    source: str = "ai"
    warnings: list[str] = Field(default_factory=list)
    word_count: int = 0


class AIEnhanceCVRequest(BaseModel):
    """Request model for live ATS CV enhancement."""
    cv_data: CVData
    target_role: str = Field(default="", max_length=120)
    job_description: str = Field(default="", max_length=12000)
    current_score: int = Field(default=0, ge=0, le=100)

    @field_validator("target_role", "job_description")
    @classmethod
    def strip_enhance_text(cls, value: str) -> str:
        return value.strip()


class AIEnhanceCVResponse(BaseModel):
    """Structured response for ATS CV enhancement."""
    cv_data: dict
    source: str
    changes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    market_keywords: list[str] = Field(default_factory=list)


class AIStatusResponse(BaseModel):
    """Response model for public AI capability metadata."""
    configured: bool
    provider: str
    base_url: str
    model: str
    supported_tasks: list[str]
    fallback_available: bool


@router.get("/ai/status")
@limiter.limit("30/minute")
async def ai_status(request: Request) -> AIStatusResponse:
    """Return AI provider and fallback capability metadata."""
    from services.ai_service import AIService

    return AIStatusResponse(**AIService.status())


@router.post("/ai/suggest")
@limiter.limit("20/minute")
async def ai_suggest(request: Request, suggest_request: AISuggestRequest) -> AISuggestResponse:
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
        if not suggest_request.text and suggest_request.type not in {"generate", "skills"}:
            raise HTTPException(status_code=422, detail="Text is required for this AI suggestion type.")

        result = AIService.suggest(suggest_request.type, suggest_request.text, suggest_request.context or "")
        if not result.text:
            logger.warning(f"AI service returned empty result for type: {suggest_request.type}")
            raise HTTPException(
                status_code=503, 
                detail="AI service temporarily unavailable. Please try again."
            )

        if suggest_request.type == "skills":
            skills = [skill.strip() for skill in result.text.split(",") if skill.strip()][:5]
            return AISuggestResponse(
                suggestion=", ".join(skills),
                suggestions=skills,
                source=result.source,
                warnings=result.warnings,
                word_count=len(skills),
            )

        return AISuggestResponse(
            suggestion=result.text,
            source=result.source,
            warnings=result.warnings,
            word_count=len(result.text.split()),
        )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI suggestion error: {str(e)}")
        raise HTTPException(
            status_code=503, 
            detail="AI service temporarily unavailable. Please try again."
        )


@router.post("/ai/enhance-cv")
@limiter.limit("10/minute")
async def ai_enhance_cv(request: Request, enhance_request: AIEnhanceCVRequest) -> AIEnhanceCVResponse:
    """Enhance the current live CV for ATS strength and target-role fit."""
    from services.ai_service import AIService

    try:
        result = AIService.enhance_cv_for_ats(
            cv_data=enhance_request.cv_data.model_dump(),
            target_role=enhance_request.target_role,
            job_description=enhance_request.job_description,
            current_score=enhance_request.current_score,
        )
        return AIEnhanceCVResponse(**result)
    except Exception as e:
        logger.error(f"AI CV enhancement error: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail="CV enhancement is temporarily unavailable. Please try again.",
        )


# --- PDF Extraction Endpoint ---

@router.post("/extract-pdf")
@limiter.limit("10/minute")
async def extract_pdf(
    request: Request,
    file: UploadFile = File(...),
) -> dict:
    """
    Extract structured CV data from an uploaded PDF file.
    
    Uses PyMuPDF for text extraction and heuristic parsing.
    No AI API key required — works entirely offline.
    Returns structured data matching the CVData schema.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a .pdf file."
        )
    
    # Validate file size (max 10MB)
    contents = await file.read()
    max_size = 10 * 1024 * 1024  # 10MB
    if len(contents) > max_size:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size is 10MB."
        )
    
    if len(contents) == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty."
        )
    
    # Check service availability
    if not PDFExtractService.is_available():
        raise HTTPException(
            status_code=503,
            detail="PDF extraction service is not available. PyMuPDF is not installed."
        )
    
    try:
        result = PDFExtractService.extract_from_pdf(contents)
        logger.info(f"PDF extraction successful: {file.filename}")
        return {
            "success": True,
            "cv_data": result["cv_data"],
            "raw_text_length": result["raw_text_length"],
            "message": f"Successfully extracted data from {file.filename}"
        }
    except ValueError as e:
        logger.warning(f"PDF extraction validation error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract data from PDF: {str(e)}"
        )
