from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from schemas.cv import CVData

AISuggestType = Literal[
    "summary",
    "headline",
    "bullet",
    "education",
    "project_summary",
    "project_highlight",
    "skills",
    "generate",
    "honor",
]


class AISuggestRequest(BaseModel):
    text: str = Field(default="", max_length=8000)
    context: Optional[str] = ""
    type: AISuggestType = "summary"

    @field_validator("text", "context")
    @classmethod
    def strip_ai_text(cls, value: str | None) -> str:
        return value.strip() if value else ""


class AISuggestResponse(BaseModel):
    suggestion: str
    suggestions: Optional[list[str]] = None
    source: Literal["ai", "fallback"] = "ai"
    warnings: list[str] = Field(default_factory=list)
    word_count: int = 0


class AIEnhanceCVRequest(BaseModel):
    cv_data: CVData
    target_role: str = Field(default="", max_length=120)
    job_description: str = Field(default="", max_length=12000)
    current_score: int = Field(default=0, ge=0, le=100)

    @field_validator("target_role", "job_description")
    @classmethod
    def strip_enhance_text(cls, value: str) -> str:
        return value.strip()


class AIEnhanceCVResponse(BaseModel):
    cv_data: CVData
    source: Literal["ai", "fallback"]
    changes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    market_keywords: list[str] = Field(default_factory=list)


class AIStatusResponse(BaseModel):
    configured: bool
    provider: str
    base_url: str
    model: str
    supported_tasks: list[str]
    fallback_available: bool
