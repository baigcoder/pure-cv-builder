from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from schemas.cv import CVData, DesignSettings

VersionSource = Literal["create", "auto", "manual", "restore", "import"]


class SavedCoverLetter(BaseModel):
    """The editor's cover letter draft, stored with the resume."""

    model_config = ConfigDict(extra="ignore")

    targetRole: str = Field(default="", max_length=120)
    company: str = Field(default="", max_length=120)
    hiringManager: str = Field(default="", max_length=120)
    jobDescription: str = Field(default="", max_length=12000)
    tone: str = Field(default="professional", max_length=40)
    letter: str = Field(default="", max_length=8000)
    source: Literal["", "ai", "template"] = ""


def _clean_title(value: str) -> str:
    return " ".join(value.split())


class ResumeCreate(BaseModel):
    title: str = Field(default="Untitled CV", min_length=1, max_length=120)
    theme: str = Field(default="classic", max_length=64)
    cv_data: CVData = Field(default_factory=CVData)
    design_settings: DesignSettings = Field(default_factory=DesignSettings)
    cover_letter: SavedCoverLetter = Field(default_factory=SavedCoverLetter)
    source: Literal["create", "import"] = "create"

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return _clean_title(value) or "Untitled CV"


class ResumeUpdate(BaseModel):
    """Partial update. ``revision`` must match the stored revision."""

    revision: int = Field(ge=1)
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    theme: Optional[str] = Field(default=None, max_length=64)
    cv_data: Optional[CVData] = None
    design_settings: Optional[DesignSettings] = None
    cover_letter: Optional[SavedCoverLetter] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        return None if value is None else (_clean_title(value) or "Untitled CV")


class ResumeSummary(BaseModel):
    id: str
    title: str
    theme: str
    revision: int
    name: str = ""
    headline: str = ""
    latest_version: int = 0
    created_at: datetime
    updated_at: datetime


class ResumeDetail(ResumeSummary):
    cv_data: CVData
    design_settings: DesignSettings
    cover_letter: SavedCoverLetter


class ResumeListResponse(BaseModel):
    items: list[ResumeSummary]
    limit: int


class VersionCreate(BaseModel):
    label: str = Field(default="", max_length=120)


class VersionSummary(BaseModel):
    version: int
    source: VersionSource
    label: str
    title: str
    theme: str
    created_at: datetime


class VersionDetail(VersionSummary):
    cv_data: CVData
    design_settings: DesignSettings


class VersionListResponse(BaseModel):
    items: list[VersionSummary]


class MeResponse(BaseModel):
    id: str
    email: str
