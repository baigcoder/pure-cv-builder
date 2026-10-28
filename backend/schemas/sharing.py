from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ShareUpdate(BaseModel):
    enabled: bool = True
    section_order: Optional[list[str]] = Field(default=None, max_length=20)


class ShareStatus(BaseModel):
    enabled: bool
    slug: Optional[str] = None
    views: int = 0
    downloads: int = 0
    last_viewed_at: Optional[datetime] = None


class PublicCV(BaseModel):
    name: str
    headline: str
    title: str
    pages: list[str] = Field(description="PNG data URLs of the rendered pages.")
    page_count: int
    updated_at: datetime
