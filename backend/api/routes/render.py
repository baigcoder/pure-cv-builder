"""CV rendering, preview, and YAML export routes."""

import asyncio
import base64

from fastapi import APIRouter, Request
from fastapi.responses import Response

from core.limiter import DEFAULT_LIMIT, PREVIEW_LIMIT, RENDER_LIMIT, limiter
from core.errors import AppError
from schemas.render import (
    PreviewPagesResponse,
    RenderRequest,
    Thumbnail,
    ThumbnailsRequest,
    ThumbnailsResponse,
    ThemesResponse,
    YAMLResponse,
)
from services.cv_service import CVService
from services.render_engine import run_render

router = APIRouter(tags=["render"])

MEDIA_TYPES = {"pdf": "application/pdf", "png": "image/png"}


def _render_kwargs(render_request: RenderRequest) -> dict:
    return {
        "cv_data": render_request.cv_data.model_dump(),
        "theme": render_request.theme,
        "design_settings": (
            render_request.design_settings.model_dump() if render_request.design_settings else None
        ),
        "section_order": render_request.section_order,
    }


async def _render_file(render_request: RenderRequest) -> Response:
    file_bytes, filename = await run_render(
        CVService.render_cv,
        output_format=render_request.format,
        **_render_kwargs(render_request),
    )
    return Response(
        content=file_bytes,
        media_type=MEDIA_TYPES[render_request.format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/themes")
@limiter.limit(DEFAULT_LIMIT)
async def get_themes(request: Request) -> ThemesResponse:
    """List available CV themes and ApplyForge presets."""
    return ThemesResponse(themes=CVService.get_theme_metadata(), default="classic")


@router.post("/render", response_class=Response)
@limiter.limit(RENDER_LIMIT)
async def render_cv(request: Request, render_request: RenderRequest) -> Response:
    """Render the CV as a PNG of page one or as a PDF."""
    return await _render_file(render_request)


@router.post("/preview", response_class=Response)
@limiter.limit(PREVIEW_LIMIT)
async def preview_cv(request: Request, render_request: RenderRequest) -> Response:
    """PNG of the first page. Prefer /preview/pages for multi-page CVs."""
    render_request.format = "png"
    return await _render_file(render_request)


@router.post("/preview/pages")
@limiter.limit(PREVIEW_LIMIT)
async def preview_pages(request: Request, render_request: RenderRequest) -> PreviewPagesResponse:
    """Every page of the CV as PNG data URLs."""
    result = await run_render(CVService.render_preview_pages, **_render_kwargs(render_request))
    return PreviewPagesResponse(
        pages=[f"data:image/png;base64,{base64.b64encode(page).decode('ascii')}" for page in result.pages],
        page_count=result.page_count,
        truncated=result.page_count > len(result.pages),
        cached=result.cached,
    )


@router.post("/preview/thumbnails")
@limiter.limit(PREVIEW_LIMIT)
async def preview_thumbnails(request: Request, payload: ThumbnailsRequest) -> ThumbnailsResponse:
    """Page one of the CV in several themes at low resolution, for galleries.

    One failing theme doesn't fail the request; its entry carries an error.
    """
    cv_data = payload.cv_data.model_dump()
    design = payload.design_settings.model_dump() if payload.design_settings else None

    async def render_one(theme: str, section_order: list[str] | None, item_design: dict | None) -> Thumbnail:
        try:
            image = await run_render(
                CVService.render_thumbnail,
                cv_data=cv_data,
                theme=theme,
                design_settings=item_design or design,
                section_order=section_order,
            )
        except AppError as error:
            return Thumbnail(theme=theme, error=error.detail)
        return Thumbnail(theme=theme, image=f"data:image/png;base64,{base64.b64encode(image).decode('ascii')}")

    thumbnails = await asyncio.gather(*(render_one(
            item.theme,
            item.section_order,
            item.design_settings.model_dump() if item.design_settings else None,
        )
        for item in payload.items))
    return ThumbnailsResponse(thumbnails=list(thumbnails))


@router.post("/download", response_class=Response)
@limiter.limit(RENDER_LIMIT)
async def download_cv(request: Request, render_request: RenderRequest) -> Response:
    """Download the CV as a PDF."""
    render_request.format = "pdf"
    return await _render_file(render_request)


@router.post("/yaml")
@limiter.limit(DEFAULT_LIMIT)
async def generate_yaml(request: Request, render_request: RenderRequest) -> YAMLResponse:
    """Return the RenderCV YAML that would be used to render this CV."""
    kwargs = _render_kwargs(render_request)
    yaml_str = CVService.generate_yaml(
        kwargs["cv_data"],
        kwargs["theme"],
        kwargs["design_settings"],
        kwargs["section_order"],
    )
    return YAMLResponse(yaml=yaml_str)
