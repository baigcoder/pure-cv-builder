"""Database tables for saved CVs and their version history.

Users live in Supabase Auth (``auth.users``); rows here reference them by the
token's ``sub`` claim in ``owner_id``. There is deliberately no foreign key to
``auth.users`` so the schema also runs on SQLite for local development.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Resume(Base):
    __tablename__ = "resumes"
    __table_args__ = (Index("ix_resumes_owner_updated", "owner_id", "updated_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    theme: Mapped[str] = mapped_column(String(64), nullable=False, default="classic")
    cv_data: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    design_settings: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    cover_letter: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    # Incremented on every write; clients send it back for optimistic locking.
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    versions: Mapped[list["ResumeVersion"]] = relationship(
        back_populates="resume",
        cascade="all, delete-orphan",
        order_by="ResumeVersion.version",
    )


class ResumeVersion(Base):
    """An immutable snapshot of a resume's content."""

    __tablename__ = "resume_versions"
    __table_args__ = (UniqueConstraint("resume_id", "version", name="uq_resume_versions_resume_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    resume_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    # "create" | "auto" | "manual" | "restore" | "import"
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    theme: Mapped[str] = mapped_column(String(64), nullable=False)
    cv_data: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    design_settings: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    resume: Mapped[Resume] = relationship(back_populates="versions")
