"""Saved resumes with optimistic locking and version history.

Versioning policy:
- Creating or importing a resume stores version 1.
- Autosaves update the resume in place. An "auto" snapshot is added when the
  content changed and the newest snapshot is older than VERSION_SNAPSHOT_MINUTES,
  so history stays useful without one version per keystroke.
- Users can save a labelled "manual" version at any time; restoring a version
  first snapshots the current state, then writes the old content as a new head.
- Only "auto" snapshots are pruned (oldest first) beyond MAX_AUTO_VERSIONS.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.auth import AuthUser
from core.config import get_settings
from core.errors import AppError
from db.models import Resume, ResumeVersion, utcnow
from schemas.resume import (
    ResumeCreate,
    ResumeDetail,
    ResumeSummary,
    ResumeUpdate,
    VersionDetail,
    VersionSummary,
)

MAX_CONTENT_BYTES = 512 * 1024


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class RevisionConflictError(AppError):
    status_code = 409
    code = "revision_conflict"


class ResumeLimitError(AppError):
    status_code = 409
    code = "resume_limit_reached"


class ContentTooLargeError(AppError):
    status_code = 413
    code = "content_too_large"


def _as_utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes even for timezone-aware columns.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _check_size(*payloads: Any) -> None:
    size = sum(len(json.dumps(payload, ensure_ascii=False)) for payload in payloads)
    if size > MAX_CONTENT_BYTES:
        raise ContentTooLargeError("This CV is too large to save. Shorten some sections and try again.")


def _latest_version(db: Session, resume_id: str) -> ResumeVersion | None:
    return db.scalars(
        select(ResumeVersion)
        .where(ResumeVersion.resume_id == resume_id)
        .order_by(ResumeVersion.version.desc())
        .limit(1)
    ).first()


def _add_version(db: Session, resume: Resume, source: str, label: str = "") -> ResumeVersion:
    latest = _latest_version(db, resume.id)
    version = ResumeVersion(
        resume_id=resume.id,
        version=(latest.version if latest else 0) + 1,
        source=source,
        label=label,
        title=resume.title,
        theme=resume.theme,
        cv_data=resume.cv_data,
        design_settings=resume.design_settings,
    )
    db.add(version)
    db.flush()
    _prune_auto_versions(db, resume.id)
    return version


def _prune_auto_versions(db: Session, resume_id: str) -> None:
    max_auto = get_settings().max_auto_versions
    auto_versions = db.scalars(
        select(ResumeVersion)
        .where(ResumeVersion.resume_id == resume_id, ResumeVersion.source == "auto")
        .order_by(ResumeVersion.version.desc())
        .offset(max_auto)
    ).all()
    for version in auto_versions:
        db.delete(version)


def _summary(resume: Resume, latest_version: int) -> ResumeSummary:
    return ResumeSummary(
        id=resume.id,
        title=resume.title,
        theme=resume.theme,
        revision=resume.revision,
        name=str(resume.cv_data.get("name") or ""),
        headline=str(resume.cv_data.get("headline") or ""),
        latest_version=latest_version,
        created_at=_as_utc(resume.created_at),
        updated_at=_as_utc(resume.updated_at),
    )


def _detail(db: Session, resume: Resume) -> ResumeDetail:
    latest = _latest_version(db, resume.id)
    return ResumeDetail(
        **_summary(resume, latest.version if latest else 0).model_dump(),
        cv_data=resume.cv_data,
        design_settings=resume.design_settings,
        cover_letter=resume.cover_letter,
    )


def _version_summary(version: ResumeVersion) -> VersionSummary:
    return VersionSummary(
        version=version.version,
        source=version.source,
        label=version.label,
        title=version.title,
        theme=version.theme,
        created_at=_as_utc(version.created_at),
    )


def _get_owned(db: Session, user: AuthUser, resume_id: str, *, for_update: bool = False) -> Resume:
    query = select(Resume).where(
        Resume.id == resume_id,
        Resume.owner_id == user.id,
        Resume.deleted_at.is_(None),
    )
    if for_update:
        query = query.with_for_update()
    resume = db.scalars(query).first()
    if resume is None:
        # Same response for missing and not-yours, so ids can't be probed.
        raise NotFoundError("This CV doesn't exist or was deleted.")
    return resume


def list_resumes(db: Session, user: AuthUser) -> list[ResumeSummary]:
    latest = (
        select(ResumeVersion.resume_id, func.max(ResumeVersion.version).label("latest"))
        .group_by(ResumeVersion.resume_id)
        .subquery()
    )
    rows = db.execute(
        select(Resume, func.coalesce(latest.c.latest, 0))
        .outerjoin(latest, latest.c.resume_id == Resume.id)
        .where(Resume.owner_id == user.id, Resume.deleted_at.is_(None))
        .order_by(Resume.updated_at.desc())
    ).all()
    return [_summary(resume, latest_version) for resume, latest_version in rows]


def create_resume(db: Session, user: AuthUser, payload: ResumeCreate) -> ResumeDetail:
    limit = get_settings().max_resumes_per_user
    count = db.scalar(
        select(func.count()).select_from(Resume).where(Resume.owner_id == user.id, Resume.deleted_at.is_(None))
    )
    if (count or 0) >= limit:
        raise ResumeLimitError(f"You can keep up to {limit} CVs. Delete one to create another.")

    cv_data = payload.cv_data.model_dump()
    _check_size(cv_data, payload.cover_letter.model_dump())
    resume = Resume(
        owner_id=user.id,
        title=payload.title,
        theme=payload.theme,
        cv_data=cv_data,
        design_settings=payload.design_settings.model_dump(),
        cover_letter=payload.cover_letter.model_dump(),
        revision=1,
    )
    db.add(resume)
    db.flush()
    _add_version(db, resume, payload.source)
    db.commit()
    return _detail(db, resume)


def get_resume(db: Session, user: AuthUser, resume_id: str) -> ResumeDetail:
    return _detail(db, _get_owned(db, user, resume_id))


def update_resume(db: Session, user: AuthUser, resume_id: str, payload: ResumeUpdate) -> ResumeDetail:
    resume = _get_owned(db, user, resume_id, for_update=True)
    if payload.revision != resume.revision:
        raise RevisionConflictError(
            "This CV was changed in another tab or device. Reload to get the latest version.",
            fields={"revision": str(resume.revision)},
        )

    changes: dict[str, Any] = {}
    if payload.title is not None:
        changes["title"] = payload.title
    if payload.theme is not None:
        changes["theme"] = payload.theme
    if payload.cv_data is not None:
        changes["cv_data"] = payload.cv_data.model_dump()
    if payload.design_settings is not None:
        changes["design_settings"] = payload.design_settings.model_dump()
    if payload.cover_letter is not None:
        changes["cover_letter"] = payload.cover_letter.model_dump()

    changes = {key: value for key, value in changes.items() if getattr(resume, key) != value}
    if not changes:
        return _detail(db, resume)

    _check_size(changes.get("cv_data", resume.cv_data), changes.get("cover_letter", resume.cover_letter))
    for key, value in changes.items():
        setattr(resume, key, value)
    resume.revision += 1
    resume.updated_at = utcnow()
    db.flush()

    versioned_fields = {"title", "theme", "cv_data", "design_settings"}
    if versioned_fields & changes.keys():
        latest = _latest_version(db, resume.id)
        interval = timedelta(minutes=get_settings().version_snapshot_minutes)
        if latest is None or utcnow() - _as_utc(latest.created_at) >= interval:
            _add_version(db, resume, "auto")

    db.commit()
    return _detail(db, resume)


def delete_resume(db: Session, user: AuthUser, resume_id: str) -> None:
    resume = _get_owned(db, user, resume_id, for_update=True)
    resume.deleted_at = utcnow()
    db.commit()


def duplicate_resume(db: Session, user: AuthUser, resume_id: str) -> ResumeDetail:
    source = _get_owned(db, user, resume_id)
    title = f"{source.title} (copy)"[:120]
    return create_resume(
        db,
        user,
        ResumeCreate(
            title=title,
            theme=source.theme,
            cv_data=source.cv_data,
            design_settings=source.design_settings,
            cover_letter=source.cover_letter,
        ),
    )


def list_versions(db: Session, user: AuthUser, resume_id: str) -> list[VersionSummary]:
    resume = _get_owned(db, user, resume_id)
    versions = db.scalars(
        select(ResumeVersion).where(ResumeVersion.resume_id == resume.id).order_by(ResumeVersion.version.desc())
    ).all()
    return [_version_summary(version) for version in versions]


def _get_version(db: Session, resume: Resume, version_number: int) -> ResumeVersion:
    version = db.scalars(
        select(ResumeVersion).where(
            ResumeVersion.resume_id == resume.id,
            ResumeVersion.version == version_number,
        )
    ).first()
    if version is None:
        raise NotFoundError("That version doesn't exist.")
    return version


def get_version(db: Session, user: AuthUser, resume_id: str, version_number: int) -> VersionDetail:
    version = _get_version(db, _get_owned(db, user, resume_id), version_number)
    return VersionDetail(
        **_version_summary(version).model_dump(),
        cv_data=version.cv_data,
        design_settings=version.design_settings,
    )


def save_version(db: Session, user: AuthUser, resume_id: str, label: str) -> VersionSummary:
    resume = _get_owned(db, user, resume_id, for_update=True)
    version = _add_version(db, resume, "manual", label.strip())
    db.commit()
    return _version_summary(version)


def restore_version(db: Session, user: AuthUser, resume_id: str, version_number: int) -> ResumeDetail:
    resume = _get_owned(db, user, resume_id, for_update=True)
    target = _get_version(db, resume, version_number)

    latest = _latest_version(db, resume.id)
    current_matches_latest = latest is not None and (
        latest.cv_data == resume.cv_data
        and latest.theme == resume.theme
        and latest.title == resume.title
        and latest.design_settings == resume.design_settings
    )
    if not current_matches_latest:
        # Keep the unsaved head so restoring is always reversible.
        _add_version(db, resume, "auto", "Before restore")

    resume.title = target.title
    resume.theme = target.theme
    resume.cv_data = target.cv_data
    resume.design_settings = target.design_settings
    resume.revision += 1
    resume.updated_at = utcnow()
    db.flush()
    _add_version(db, resume, "restore", f"Restored version {target.version}")
    db.commit()
    return _detail(db, resume)
