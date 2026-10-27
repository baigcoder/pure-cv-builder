"""Cover letter generation and PDF export routes."""

import json
import logging
from collections.abc import Iterator

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, StreamingResponse

from core.errors import ServiceUnavailableError
from core.limiter import AI_LIMIT, RENDER_LIMIT, limiter
from schemas.cover_letter import CoverLetterRequest, CoverLetterResponse
from services.ai_service import AIService, clean_plain_text
from services.cover_letter_service import CoverLetterService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])

TEMPLATE_CHUNK_WORDS = 12


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


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _stream_letter(cv_dict: dict, cover_letter, ai_only: bool) -> Iterator[str]:
    """Server-sent events: ``delta`` text chunks, then ``done`` with the final letter.

    Streams from the AI provider when configured. If that yields nothing usable,
    sends ``reset`` and streams the template letter instead, unless ``ai_only``.
    """
    source = "template"
    letter = ""

    if AIService.is_configured():
        prompt = AIService.cover_letter_prompt(
            cv_dict,
            cover_letter.target_role,
            cover_letter.company,
            cover_letter.hiring_manager,
            cover_letter.job_description,
            cover_letter.tone,
        )
        parts: list[str] = []
        for delta in AIService.stream_provider(prompt, max_tokens=AIService.max_tokens_for_task("cover_letter")):
            parts.append(delta)
            yield _sse("delta", {"text": delta})
        candidate = clean_plain_text("".join(parts))
        if candidate and not AIService.validate_text("cover_letter", candidate):
            letter, source = candidate, "ai"
        elif parts:
            logger.info("Streamed cover letter failed validation; falling back to template")
            yield _sse("reset", {})

    if not letter:
        if ai_only:
            yield _sse("error", {"detail": "AI cover letter generation is temporarily unavailable. Please try again."})
            return
        letter = _fallback_letter(cv_dict, cover_letter)
        words = letter.split(" ")
        for start in range(0, len(words), TEMPLATE_CHUNK_WORDS):
            chunk = " ".join(words[start:start + TEMPLATE_CHUNK_WORDS])
            yield _sse("delta", {"text": chunk + (" " if start + TEMPLATE_CHUNK_WORDS < len(words) else "")})

    letter = CoverLetterService.normalize_letter_spacing(letter)
    yield _sse("done", {"letter": letter, "source": source, "word_count": CoverLetterService.word_count(letter)})


@router.post("/stream", response_class=StreamingResponse)
@limiter.limit(AI_LIMIT)
async def stream_cover_letter(request: Request, cover_letter_request: CoverLetterRequest) -> StreamingResponse:
    """Generate a cover letter as server-sent events (``delta``, ``reset``, ``done``, ``error``)."""
    if cover_letter_request.ai_only and not AIService.is_configured():
        raise ServiceUnavailableError(
            "AI cover letter generation is not configured. Set OPENCODE_API_KEY to enable AI generation."
        )
    return StreamingResponse(
        _stream_letter(
            cover_letter_request.cv_data.model_dump(),
            cover_letter_request.cover_letter,
            cover_letter_request.ai_only,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
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
