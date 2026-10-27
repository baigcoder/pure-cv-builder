"""The signed-in user's job applications, optionally linked to a saved CV."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.auth import AuthUser
from db.models import Application, Resume, utcnow
from schemas.application import (
    ApplicationCreate,
    ApplicationOut,
    ApplicationUpdate,
    TailoredResumeResponse,
)
from schemas.resume import ResumeCreate
from services.resume_service import NotFoundError, ResumeLimitError, _get_owned, create_resume

MAX_APPLICATIONS_PER_USER = 500


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _out(application: Application, resume_title: str | None) -> ApplicationOut:
    return ApplicationOut(
        id=application.id,
        company=application.company,
        role=application.role,
        status=application.status,
        job_url=application.job_url,
        job_description=application.job_description,
        location=application.location,
        notes=application.notes,
        resume_id=application.resume_id,
        resume_title=resume_title,
        applied_at=_as_utc(application.applied_at),
        created_at=_as_utc(application.created_at),
        updated_at=_as_utc(application.updated_at),
    )


def _resume_title(db: Session, user: AuthUser, resume_id: str | None) -> str | None:
    if not resume_id:
        return None
    return db.scalar(
        select(Resume.title).where(Resume.id == resume_id, Resume.owner_id == user.id, Resume.deleted_at.is_(None))
    )


def _get_owned_application(db: Session, user: AuthUser, application_id: str) -> Application:
    application = db.scalars(
        select(Application).where(Application.id == application_id, Application.owner_id == user.id)
    ).first()
    if application is None:
        raise NotFoundError("This application doesn't exist or was deleted.")
    return application


def _check_resume(db: Session, user: AuthUser, resume_id: str | None) -> None:
    if resume_id:
        _get_owned(db, user, resume_id)


def list_applications(db: Session, user: AuthUser) -> list[ApplicationOut]:
    rows = db.execute(
        select(Application, Resume.title)
        .outerjoin(Resume, (Resume.id == Application.resume_id) & Resume.deleted_at.is_(None))
        .where(Application.owner_id == user.id)
        .order_by(Application.updated_at.desc())
    ).all()
    return [_out(application, title) for application, title in rows]


def create_application(db: Session, user: AuthUser, payload: ApplicationCreate) -> ApplicationOut:
    count = db.scalar(select(func.count()).select_from(Application).where(Application.owner_id == user.id))
    if (count or 0) >= MAX_APPLICATIONS_PER_USER:
        raise ResumeLimitError(f"You can track up to {MAX_APPLICATIONS_PER_USER} applications.")
    _check_resume(db, user, payload.resume_id)
    application = Application(owner_id=user.id, **payload.model_dump())
    if application.status != "saved":
        application.applied_at = utcnow()
    db.add(application)
    db.commit()
    return _out(application, _resume_title(db, user, application.resume_id))


def update_application(db: Session, user: AuthUser, application_id: str, payload: ApplicationUpdate) -> ApplicationOut:
    application = _get_owned_application(db, user, application_id)
    changes = payload.model_dump(exclude_unset=True)
    if "resume_id" in changes:
        _check_resume(db, user, changes["resume_id"])
    for key, value in changes.items():
        setattr(application, key, value.strip() if isinstance(value, str) and key != "job_description" else value)
    # The first move past "saved" records when the user applied.
    if application.status != "saved" and application.applied_at is None:
        application.applied_at = utcnow()
    application.updated_at = utcnow()
    db.commit()
    return _out(application, _resume_title(db, user, application.resume_id))


def delete_application(db: Session, user: AuthUser, application_id: str) -> None:
    db.delete(_get_owned_application(db, user, application_id))
    db.commit()


def tailor_resume(db: Session, user: AuthUser, application_id: str, base_resume_id: str) -> TailoredResumeResponse:
    """Copy a CV for this job, carry the job into its cover letter, and link the copy."""
    application = _get_owned_application(db, user, application_id)
    base = _get_owned(db, user, base_resume_id)
    cover_letter = {
        **(base.cover_letter or {}),
        "targetRole": application.role,
        "company": application.company,
        "jobDescription": application.job_description,
        "letter": "",
        "source": "",
    }
    detail = create_resume(
        db,
        user,
        ResumeCreate(
            title=f"{application.company} - {application.role}"[:120],
            theme=base.theme,
            cv_data=base.cv_data,
            design_settings=base.design_settings,
            cover_letter=cover_letter,
        ),
    )
    application.resume_id = detail.id
    application.updated_at = utcnow()
    db.commit()
    return TailoredResumeResponse(application=_out(application, detail.title), resume_id=detail.id)
