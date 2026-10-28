"""Public read-only share links for saved CVs, with simple view and download counts."""

import secrets

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.auth import AuthUser
from db.models import Resume, ShareLink, utcnow
from schemas.sharing import ShareStatus, ShareUpdate
from services.resume_service import NotFoundError, _get_owned


def _status(link: ShareLink | None) -> ShareStatus:
    if link is None:
        return ShareStatus(enabled=False)
    return ShareStatus(
        enabled=link.enabled,
        slug=link.slug,
        views=link.views,
        downloads=link.downloads,
        last_viewed_at=link.last_viewed_at,
    )


def _link_for(db: Session, resume_id: str) -> ShareLink | None:
    return db.scalars(select(ShareLink).where(ShareLink.resume_id == resume_id)).first()


def get_share(db: Session, user: AuthUser, resume_id: str) -> ShareStatus:
    resume = _get_owned(db, user, resume_id)
    return _status(_link_for(db, resume.id))


def set_share(db: Session, user: AuthUser, resume_id: str, payload: ShareUpdate) -> ShareStatus:
    """Turn sharing on or off. The slug survives being turned off, so a re-enabled link still works."""
    resume = _get_owned(db, user, resume_id)
    link = _link_for(db, resume.id)
    if link is None:
        if not payload.enabled:
            return _status(None)
        for _ in range(5):
            link = ShareLink(resume_id=resume.id, slug=secrets.token_urlsafe(9), enabled=True)
            db.add(link)
            try:
                db.flush()
                break
            except IntegrityError:
                db.rollback()
                link = None
        if link is None:
            raise RuntimeError("Could not allocate a share link")
    link.enabled = payload.enabled
    if payload.section_order is not None:
        link.section_order = payload.section_order
    db.commit()
    return _status(link)


def get_public(db: Session, slug: str) -> tuple[Resume, ShareLink]:
    """The shared resume, or 404 when the link is unknown, disabled or the CV was deleted."""
    row = db.execute(
        select(Resume, ShareLink)
        .join(ShareLink, ShareLink.resume_id == Resume.id)
        .where(ShareLink.slug == slug, ShareLink.enabled.is_(True), Resume.deleted_at.is_(None))
    ).first()
    if row is None:
        raise NotFoundError("This link isn't active. Ask the owner for a new one.")
    return row[0], row[1]


def record_view(db: Session, link_id: str) -> None:
    # A single UPDATE, so concurrent viewers don't lose counts.
    db.execute(
        update(ShareLink)
        .where(ShareLink.id == link_id)
        .values(views=ShareLink.views + 1, last_viewed_at=utcnow())
    )
    db.commit()


def record_download(db: Session, link_id: str) -> None:
    db.execute(update(ShareLink).where(ShareLink.id == link_id).values(downloads=ShareLink.downloads + 1))
    db.commit()
