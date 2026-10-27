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


class JobMatchRequest(BaseModel):
    cv_data: CVData
    job_description: str = Field(..., min_length=1, max_length=12000)
    target_role: str = Field(default="", max_length=120)


class KeywordMatch(BaseModel):
    keyword: str
    category: Literal["language", "framework", "data", "cloud", "devops", "ai", "practice", "soft", "tool"]
    importance: Literal["required", "core", "preferred"]
    mentions: int
    found_in: list[Literal["summary", "headline", "skills", "experience", "projects", "education", "other"]] = Field(
        default_factory=list
    )
    suggestion: str = ""


class JobMatchResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    summary: str
    matched: list[KeywordMatch]
    missing: list[KeywordMatch]
    years_required: Optional[int] = None
    title_match: bool
    target_title: str


class BulletRef(BaseModel):
    section: Literal["experience", "projects"]
    entry_index: int = Field(ge=0)
    bullet_index: int = Field(ge=0)


class TailorBulletsRequest(BaseModel):
    cv_data: CVData
    job_description: str = Field(..., min_length=40, max_length=12000)
    keywords: list[str] = Field(default_factory=list, max_length=30)
    max_bullets: int = Field(default=8, ge=1, le=20)


class BulletSuggestion(BulletRef):
    original: str
    suggestion: str
    keywords_added: list[str] = Field(default_factory=list)


class BulletHint(BulletRef):
    original: str
    keywords: list[str]


class TailorBulletsResponse(BaseModel):
    source: Literal["ai", "guidance"]
    suggestions: list[BulletSuggestion] = Field(default_factory=list)
    hints: list[BulletHint] = Field(default_factory=list)
    message: str = ""


class RewriteBulletRequest(BaseModel):
    text: str = Field(min_length=3, max_length=400)
    mode: Literal["improve", "quantify", "shorten", "stronger"] = "improve"
    role: str = Field(default="", max_length=120)
    job_description: str = Field(default="", max_length=4000)


class RewriteBulletResponse(BaseModel):
    variants: list[str]
    source: Literal["ai", "fallback"]


class JobFetchRequest(BaseModel):
    url: str = Field(min_length=8, max_length=500)


class JobFetchResponse(BaseModel):
    url: str
    title: str
    company: str
    location: str
    description: str
