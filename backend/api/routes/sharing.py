"""Share links: the owner turns sharing on or off; anyone with the slug can view or download."""

import base64
from datetime import timezone

from fastapi import APIRouter, Depends, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from core.auth import AuthUser, get_current_user
from core.limiter import DEFAULT_LIMIT, PREVIEW_LIMIT, RENDER_LIMIT, limiter
from db.session import get_db
from schemas.sharing import PublicCV, ShareStatus, ShareUpdate
from services import share_service
from services.cv_service import CVService
from services.render_engine import run_render

router = APIRouter(tags=["sharing"])


@router.get("/resumes/{resume_id}/share")
@limiter.limit(DEFAULT_LIMIT)
def get_share(
    request: Request,
    resume_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ShareStatus:
    """Whether this CV has a public link, and how often it was viewed."""
    return share_service.get_share(db, user, resume_id)


@router.put("/resumes/{resume_id}/share")
@limiter.limit(DEFAULT_LIMIT)
def set_share(
    request: Request,
    resume_id: str,
    payload: ShareUpdate,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ShareStatus:
    """Turn the public link on or off (and record the section order it prints)."""
    return share_service.set_share(db, user, resume_id, payload)


def _render_kwargs(resume, link) -> dict:
    return {
        "cv_data": resume.cv_data,
        "theme": resume.theme,
        "design_settings": resume.design_settings,
        "section_order": link.section_order or None,
    }


@router.get("/public/cv/{slug}")
@limiter.limit(PREVIEW_LIMIT)
async def view_public_cv(request: Request, slug: str, db: Session = Depends(get_db)) -> PublicCV:
    """A shared CV as page images. Counts as one view."""
    resume, link = await run_in_threadpool(share_service.get_public, db, slug)
    result = await run_render(CVService.render_preview_pages, **_render_kwargs(resume, link))
    await run_in_threadpool(share_service.record_view, db, link.id)
    cv = resume.cv_data or {}
    updated = resume.updated_at if resume.updated_at.tzinfo else resume.updated_at.replace(tzinfo=timezone.utc)
    return PublicCV(
        name=str(cv.get("name") or ""),
        headline=str(cv.get("headline") or ""),
        title=resume.title,
        pages=[f"data:image/png;base64,{base64.b64encode(page).decode('ascii')}" for page in result.pages],
        page_count=result.page_count,
        updated_at=updated,
    )


@router.get("/public/cv/{slug}/pdf", response_class=Response)
@limiter.limit(RENDER_LIMIT)
async def download_public_cv(request: Request, slug: str, db: Session = Depends(get_db)) -> Response:
    """The shared CV as a PDF. Counts as one download."""
    resume, link = await run_in_threadpool(share_service.get_public, db, slug)
    pdf, _ = await run_render(CVService.render_cv, output_format="pdf", **_render_kwargs(resume, link))
    await run_in_threadpool(share_service.record_download, db, link.id)
    name = str((resume.cv_data or {}).get("name") or "CV").strip().replace(" ", "_")
    safe = "".join(ch for ch in name if ch.isalnum() or ch in "_-") or "CV"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}_CV.pdf"', "X-Robots-Tag": "noindex"},
    )
