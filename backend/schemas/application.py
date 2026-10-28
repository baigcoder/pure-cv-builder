from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

ApplicationStatus = Literal["saved", "applied", "interview", "offer", "rejected"]


class ApplicationFields(BaseModel):
    company: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=120)
    status: ApplicationStatus = "saved"
    job_url: str = Field(default="", max_length=500)
    job_description: str = Field(default="", max_length=20000)
    location: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=5000)
    resume_id: Optional[str] = Field(default=None, max_length=36)

    @field_validator("company", "role", "job_url", "location")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("job_url")
    @classmethod
    def http_url_only(cls, value: str) -> str:
        if value and not value.lower().startswith(("http://", "https://")):
            raise ValueError("Job link must start with http:// or https://")
        return value


class ApplicationCreate(ApplicationFields):
    pass


class ApplicationUpdate(BaseModel):
    """Partial update; only the fields sent are changed."""

    company: Optional[str] = Field(default=None, min_length=1, max_length=120)
    role: Optional[str] = Field(default=None, min_length=1, max_length=120)
    status: Optional[ApplicationStatus] = None
    job_url: Optional[str] = Field(default=None, max_length=500)
    job_description: Optional[str] = Field(default=None, max_length=20000)
    location: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=5000)
    resume_id: Optional[str] = Field(default=None, max_length=36)

    @field_validator("job_url")
    @classmethod
    def http_url_only(cls, value: Optional[str]) -> Optional[str]:
        if value and not value.lower().startswith(("http://", "https://")):
            raise ValueError("Job link must start with http:// or https://")
        return value


class ApplicationOut(ApplicationFields):
    id: str
    resume_title: Optional[str] = None
    applied_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ApplicationListResponse(BaseModel):
    items: list[ApplicationOut]


class TailoredResumeResponse(BaseModel):
    application: ApplicationOut
    resume_id: str
