"""The CV content model shared by every endpoint.

This module is the single source of truth for the CV shape. The frontend's
TypeScript types are generated from the OpenAPI schema built from these models
(see ``scripts/export_openapi.py`` and ``npm run gen:api``).
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _Entry(BaseModel):
    """Base for repeatable entries. ``id`` is a client-side key and never rendered."""

    model_config = ConfigDict(extra="ignore")

    id: Optional[str] = None


class ExperienceEntry(_Entry):
    company: str = ""
    position: str = ""
    date: str = ""
    start_date: str = ""
    end_date: str = "present"
    location: str = ""
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class EducationEntry(_Entry):
    institution: str = ""
    area: str = ""
    degree: str = ""
    date: str = ""
    start_date: str = ""
    end_date: str = ""
    location: str = ""
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class SkillEntry(_Entry):
    label: str = ""
    details: str = ""


class ProjectEntry(_Entry):
    name: str = ""
    date: str = ""
    start_date: str = ""
    end_date: str = ""
    location: str = ""
    url: str = ""
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class PublicationEntry(_Entry):
    title: str = ""
    authors: str | list[str] = ""
    journal: str = ""
    date: str = ""
    doi: Optional[str] = None
    url: Optional[str] = None
    summary: Optional[str] = None


class HonorEntry(_Entry):
    """Rendered as a bullet."""

    bullet: str = ""


class PatentEntry(_Entry):
    """Rendered as a numbered item."""

    number: str = ""


class TalkEntry(_Entry):
    """Rendered as a reverse-numbered item."""

    reversed_number: str = ""


class DesignSettings(BaseModel):
    primaryColor: Optional[str] = None
    fontFamily: Optional[str] = None


class CVData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = "Your Name"
    headline: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    website: str = ""
    linkedin: str = ""
    github: str = ""
    summary: str = ""
    # Accepted so client drafts round-trip; not rendered yet.
    photo: str = ""
    experience: list[ExperienceEntry] = Field(default_factory=list)
    education: list[EducationEntry] = Field(default_factory=list)
    skills: list[SkillEntry] = Field(default_factory=list)
    projects: list[ProjectEntry] = Field(default_factory=list)
    publications: list[PublicationEntry] = Field(default_factory=list)
    honors: list[HonorEntry] = Field(default_factory=list)
    patents: list[PatentEntry] = Field(default_factory=list)
    talks: list[TalkEntry] = Field(default_factory=list)

    @field_validator("phone", mode="before")
    @classmethod
    def coerce_phone_to_string(cls, value):
        # The frontend may send a numeric phone value.
        return str(value) if value is not None else ""
