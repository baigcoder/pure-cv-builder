"""Cover letter generation and PDF export routes."""

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from core.errors import ServiceUnavailableError
from core.limiter import AI_LIMIT, RENDER_LIMIT, limiter
from schemas.cover_letter import CoverLetterRequest, CoverLetterResponse
from services.ai_service import AIService
from services.cover_letter_service import CoverLetterService

router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])


def _fallback_letter(cv_dict: dict, cover_letter) -> str:
    return CoverLetterService.build_fallback_letter(
        cv_data=cv_dict,
        target_role=cover_letter.target_role,
        company=cover_letter.company,
        hiring_manager=cover_letter.hiring_manager,
        job_description=cover_letter.job_description,
        tone=cover_letter.tone,
    )


@router.post("/generate")
@limiter.limit(AI_LIMIT)
async def generate_cover_letter(
    request: Request,
    cover_letter_request: CoverLetterRequest,
) -> CoverLetterResponse:
    """Generate a tailored cover letter from CV data and a job description."""
    cv_dict = cover_letter_request.cv_data.model_dump()
    cover_letter = cover_letter_request.cover_letter
    ai_only = cover_letter_request.ai_only

    if ai_only and not AIService.is_configured():
        raise ServiceUnavailableError(
            "AI cover letter generation is not configured. Set OPENCODE_API_KEY to enable AI generation."
        )

    letter_text = ""
    if AIService.is_configured():
        letter_text = await run_in_threadpool(
            AIService.generate_cover_letter,
            cv_data=cv_dict,
            target_role=cover_letter.target_role,
            company=cover_letter.company,
            hiring_manager=cover_letter.hiring_manager,
            job_description=cover_letter.job_description,
            tone=cover_letter.tone,
        )

    source = "ai"
    if not letter_text.strip():
        if ai_only:
            raise ServiceUnavailableError("AI cover letter generation is temporarily unavailable. Please try again.")
        letter_text = _fallback_letter(cv_dict, cover_letter)
        source = "template"

    letter_text = CoverLetterService.normalize_letter_spacing(letter_text)
    return CoverLetterResponse(
        letter=letter_text,
        source=source,
        word_count=CoverLetterService.word_count(letter_text),
    )


@router.post("/download", response_class=Response)
@limiter.limit(RENDER_LIMIT)
async def download_cover_letter(
    request: Request,
    cover_letter_request: CoverLetterRequest,
) -> Response:
    """Download the edited cover letter as an ATS-friendly PDF."""
    cv_dict = cover_letter_request.cv_data.model_dump()
    cover_letter = cover_letter_request.cover_letter
    letter_text = cover_letter.letter or _fallback_letter(cv_dict, cover_letter)
    pdf_bytes = await run_in_threadpool(
        CoverLetterService.render_pdf,
        cv_data=cv_dict,
        letter_text=CoverLetterService.normalize_letter_spacing(letter_text),
    )
    safe_name = (cv_dict.get("name") or "Cover_Letter").replace(" ", "_")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_Cover_Letter.pdf"'},
    )
