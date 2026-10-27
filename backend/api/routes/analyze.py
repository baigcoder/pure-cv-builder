"""CV review: ATS read-back, writing, consistency and page-fit checks."""

from fastapi import APIRouter, Request

from core.limiter import RENDER_LIMIT, limiter
from schemas.analysis import AnalysisResponse
from schemas.render import RenderRequest
from services import cv_analyzer
from services.render_engine import run_render

router = APIRouter(tags=["analyze"])


@router.post("/analyze")
@limiter.limit(RENDER_LIMIT)
async def analyze_cv(request: Request, payload: RenderRequest) -> AnalysisResponse:
    """Render the CV, read it back like an ATS, and check writing, consistency and page fit."""
    result = await run_render(
        cv_analyzer.analyze,
        cv_data=payload.cv_data.model_dump(),
        theme=payload.theme,
        design_settings=payload.design_settings.model_dump() if payload.design_settings else None,
        section_order=payload.section_order,
    )
    return AnalysisResponse(**result.to_dict())
