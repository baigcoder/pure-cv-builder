"""Job application tracker for the signed-in user."""

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.auth import AuthUser, get_current_user
from core.limiter import DEFAULT_LIMIT, SAVE_LIMIT, limiter
from db.session import get_db
from schemas.application import (
    ApplicationCreate,
    ApplicationListResponse,
    ApplicationOut,
    ApplicationUpdate,
    TailoredResumeResponse,
)
from services import application_service

router = APIRouter(prefix="/applications", tags=["applications"])


class TailorRequest(BaseModel):
    base_resume_id: str = Field(max_length=36)


@router.get("")
@limiter.limit(DEFAULT_LIMIT)
def list_applications(
    request: Request, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)
) -> ApplicationListResponse:
    """The user's applications, most recently updated first."""
    return ApplicationListResponse(items=application_service.list_applications(db, user))


@router.post("", status_code=201)
@limiter.limit(SAVE_LIMIT)
def create_application(
    request: Request,
    payload: ApplicationCreate,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationOut:
    return application_service.create_application(db, user, payload)


@router.patch("/{application_id}")
@limiter.limit(SAVE_LIMIT)
def update_application(
    request: Request,
    application_id: str,
    payload: ApplicationUpdate,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationOut:
    return application_service.update_application(db, user, application_id, payload)


@router.delete("/{application_id}", status_code=204, response_class=Response)
@limiter.limit(SAVE_LIMIT)
def delete_application(
    request: Request,
    application_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    application_service.delete_application(db, user, application_id)
    return Response(status_code=204)


@router.post("/{application_id}/tailor", status_code=201)
@limiter.limit(SAVE_LIMIT)
def tailor_resume(
    request: Request,
    application_id: str,
    payload: TailorRequest,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TailoredResumeResponse:
    """Copy a CV for this job (its cover letter pre-filled with the job) and link it."""
    return application_service.tailor_resume(db, user, application_id, payload.base_resume_id)
