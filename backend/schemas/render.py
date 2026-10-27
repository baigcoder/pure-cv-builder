from typing import Literal, Optional

from pydantic import BaseModel, Field

from schemas.cv import CVData, DesignSettings


class RenderRequest(BaseModel):
    cv_data: CVData
    theme: str = "classic"
    format: Literal["png", "pdf"] = "png"
    design_settings: Optional[DesignSettings] = None
    # Theme-specific section order, e.g. ["experience", "education", "skills"].
    section_order: Optional[list[str]] = None


class YAMLResponse(BaseModel):
    yaml: str


class PreviewPagesResponse(BaseModel):
    """Every rendered page as a PNG data URL, in page order."""

    pages: list[str]
    page_count: int = Field(description="Total pages in the PDF, which may exceed len(pages).")
    truncated: bool = False
    cached: bool = False


class ThemeMetadata(BaseModel):
    id: str
    name: str
    description: str
    bestFor: str
    previewImage: str
    sectionOrderType: str
    renderTheme: Optional[str] = None
    atsScore: Optional[int] = None
    atsRationale: Optional[str] = None
    recommendedFor: list[str] = Field(default_factory=list)


class ThemesResponse(BaseModel):
    themes: list[ThemeMetadata]
    default: str


class ThumbnailItem(BaseModel):
    theme: str
    section_order: Optional[list[str]] = None
    design_settings: Optional[DesignSettings] = Field(
        default=None, description="Overrides the request-level design settings for this item."
    )


class ThumbnailsRequest(BaseModel):
    cv_data: CVData
    design_settings: Optional[DesignSettings] = None
    items: list[ThumbnailItem] = Field(min_length=1, max_length=20)


class Thumbnail(BaseModel):
    theme: str
    image: Optional[str] = Field(default=None, description="PNG data URL of page one.")
    error: Optional[str] = None


class ThumbnailsResponse(BaseModel):
    thumbnails: list[Thumbnail]
