from typing import Literal, Optional

from pydantic import BaseModel, Field


class FieldCheckOut(BaseModel):
    label: str
    expected: str
    read: str
    ok: bool


class IssueOut(BaseModel):
    id: str
    severity: Literal["high", "medium", "low"]
    category: Literal["parse", "writing", "consistency", "layout"]
    message: str
    detail: str = ""
    section: str = ""
    entry_index: Optional[int] = None
    bullet_index: Optional[int] = None
    quote: str = Field(default="", description="The bullet the issue is about, as written.")
    fix: str = Field(default="", description="A replacement for the quoted bullet, when one is safe to offer.")


class AnalysisResponse(BaseModel):
    read_back: list[FieldCheckOut] = Field(description="Fields read back from the rendered PDF, as an ATS would.")
    issues: list[IssueOut]
    page_count: int
    last_page_fill: float = Field(ge=0, le=1, description="How full the last page is, from 0 to 1.")
