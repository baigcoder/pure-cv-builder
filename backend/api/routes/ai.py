"""AI writing assistance routes.

Provider calls are blocking network I/O, so they run in the threadpool to keep
the event loop free for other requests.
"""

import logging

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool

from core.errors import AppError, ServiceUnavailableError
from core.limiter import AI_LIMIT, DEFAULT_LIMIT, limiter
from schemas.ai import (
    AIEnhanceCVRequest,
    AIEnhanceCVResponse,
    AIStatusResponse,
    AISuggestRequest,
    AISuggestResponse,
)
from services.ai_service import AIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

TEXT_OPTIONAL_TYPES = {"generate", "skills"}


@router.get("/status")
@limiter.limit(DEFAULT_LIMIT)
async def ai_status(request: Request) -> AIStatusResponse:
    """AI provider and fallback capability metadata."""
    return AIStatusResponse(**AIService.status())


@router.post("/suggest")
@limiter.limit(AI_LIMIT)
async def ai_suggest(request: Request, suggest_request: AISuggestRequest) -> AISuggestResponse:
    """Suggest improved text for one CV field (summary, bullet, skills, ...)."""
    if not suggest_request.text and suggest_request.type not in TEXT_OPTIONAL_TYPES:
        raise AppError("Text is required for this AI suggestion type.")

    result = await run_in_threadpool(
        AIService.suggest,
        suggest_request.type,
        suggest_request.text,
        suggest_request.context or "",
    )
    if not result.text:
        logger.warning("AI service returned empty result for type %s", suggest_request.type)
        raise ServiceUnavailableError("AI service temporarily unavailable. Please try again.")

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


@router.post("/enhance-cv")
@limiter.limit(AI_LIMIT)
async def ai_enhance_cv(request: Request, enhance_request: AIEnhanceCVRequest) -> AIEnhanceCVResponse:
    """Improve the live CV for ATS strength and target-role fit."""
    result = await run_in_threadpool(
        AIService.enhance_cv_for_ats,
        cv_data=enhance_request.cv_data.model_dump(),
        target_role=enhance_request.target_role,
        job_description=enhance_request.job_description,
        current_score=enhance_request.current_score,
    )
    return AIEnhanceCVResponse(**result)
