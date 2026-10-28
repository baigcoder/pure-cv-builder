from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from schemas.cv import CVData, DesignSettings


class CoverLetterData(BaseModel):
    """Cover letter target details and the editable letter text."""

    target_role: str = Field(..., min_length=2, max_length=120)
    company: str = Field(default="", max_length=120)
    hiring_manager: str = Field(default="", max_length=120)
    job_description: str = Field(..., min_length=40, max_length=12000)
    tone: str = Field(default="professional", max_length=40)
    length: Literal["short", "standard", "detailed"] = "standard"
    highlights: str = Field(
        default="", max_length=1000, description="What the letter should emphasise, e.g. why this company."
    )
    letter: str = Field(default="", max_length=8000)

    @field_validator("target_role", "company", "hiring_manager", "job_description", "tone", "highlights", "letter")
    @classmethod
    def strip_cover_letter_text(cls, value: str) -> str:
        return value.strip()


class CoverLetterRequest(BaseModel):
    cv_data: CVData
    cover_letter: CoverLetterData
    ai_only: bool = False
    design_settings: Optional[DesignSettings] = Field(
        default=None, description="The CV's font and accent colour, so the letter PDF matches."
    )


class CoverLetterResponse(BaseModel):
    letter: str
    source: Literal["ai", "template"]
    word_count: int
