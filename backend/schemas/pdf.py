from pydantic import BaseModel

from schemas.cv import CVData


class ExtractPDFResponse(BaseModel):
    success: bool
    cv_data: CVData
    raw_text_length: int
    message: str
