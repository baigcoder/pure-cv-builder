from typing import Literal

from pydantic import BaseModel, Field

from schemas.cv import CVData


class ExtractPDFResponse(BaseModel):
    success: bool
    cv_data: CVData
    raw_text_length: int
    message: str
    source: Literal["ai", "heuristic"] = "heuristic"
    warnings: list[str] = Field(default_factory=list)
    detected_format: Literal["linkedin", "resume"] = Field(
        default="resume", description="'linkedin' when the PDF is a LinkedIn profile export."
    )
