"""Saved CVs and version history for the signed-in user.

Routes are plain ``def`` so FastAPI runs the blocking database work in its
threadpool.
"""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from core.auth import AuthUser, get_current_user
from core.config import get_settings
from core.limiter import DEFAULT_LIMIT, SAVE_LIMIT, limiter
from db.session import get_db
from schemas.resume import (
    MeResponse,
    ResumeCreate,
    ResumeDetail,
    ResumeListResponse,
    ResumeUpdate,
    VersionCreate,
    VersionDetail,
    VersionListResponse,
    VersionSummary,
)
from services import resume_service

router = APIRouter(tags=["resumes"])


@router.get("/me")
@limiter.limit(DEFAULT_LIMIT)
def get_me(request: Request, user: AuthUser = Depends(get_current_user)) -> MeResponse:
    """The signed-in user, as identified by their Supabase access token."""
    return MeResponse(id=user.id, email=user.email)


@router.get("/resumes")
@limiter.limit(DEFAULT_LIMIT)
def list_resumes(
    request: Request,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeListResponse:
    """The user's CVs, most recently edited first."""
    return ResumeListResponse(
        items=resume_service.list_resumes(db, user),
        limit=get_settings().max_resumes_per_user,
    )


@router.post("/resumes", status_code=201)
@limiter.limit(DEFAULT_LIMIT)
def create_resume(
    request: Request,
    payload: ResumeCreate,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeDetail:
    """Create a CV (or import a local draft with ``source: "import"``)."""
    return resume_service.create_resume(db, user, payload)


@router.get("/resumes/{resume_id}")
@limiter.limit(DEFAULT_LIMIT)
def get_resume(
    request: Request,
    resume_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeDetail:
    return resume_service.get_resume(db, user, resume_id)


@router.patch("/resumes/{resume_id}")
@limiter.limit(SAVE_LIMIT)
def update_resume(
    request: Request,
    resume_id: str,
    payload: ResumeUpdate,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeDetail:
    """Save changes. Returns 409 ``revision_conflict`` if ``revision`` is stale."""
    return resume_service.update_resume(db, user, resume_id, payload)


@router.delete("/resumes/{resume_id}", status_code=204, response_class=Response)
@limiter.limit(DEFAULT_LIMIT)
def delete_resume(
    request: Request,
    resume_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    resume_service.delete_resume(db, user, resume_id)
    return Response(status_code=204)


@router.post("/resumes/{resume_id}/duplicate", status_code=201)
@limiter.limit(DEFAULT_LIMIT)
def duplicate_resume(
    request: Request,
    resume_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeDetail:
    return resume_service.duplicate_resume(db, user, resume_id)


@router.get("/resumes/{resume_id}/versions")
@limiter.limit(DEFAULT_LIMIT)
def list_versions(
    request: Request,
    resume_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VersionListResponse:
    """Version history, newest first (content omitted)."""
    return VersionListResponse(items=resume_service.list_versions(db, user, resume_id))


@router.post("/resumes/{resume_id}/versions", status_code=201)
@limiter.limit(DEFAULT_LIMIT)
def save_version(
    request: Request,
    resume_id: str,
    payload: VersionCreate,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VersionSummary:
    """Snapshot the current content as a labelled version."""
    return resume_service.save_version(db, user, resume_id, payload.label)


@router.get("/resumes/{resume_id}/versions/{version}")
@limiter.limit(DEFAULT_LIMIT)
def get_version(
    request: Request,
    resume_id: str,
    version: int,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VersionDetail:
    return resume_service.get_version(db, user, resume_id, version)


@router.post("/resumes/{resume_id}/versions/{version}/restore")
@limiter.limit(DEFAULT_LIMIT)
def restore_version(
    request: Request,
    resume_id: str,
    version: int,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeDetail:
    """Make an old version the current content (the previous head is kept)."""
    return resume_service.restore_version(db, user, resume_id, version)
