"""Resume PDF import route."""

import logging

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from core.errors import AppError, ServiceUnavailableError
from core.limiter import RENDER_LIMIT, limiter
from schemas.pdf import ExtractPDFResponse
from services.ai_import_service import structure_resume
from services.linkedin_import_service import parse_linkedin
from services.pdf_extract_service import PDFExtractService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["import"])

MAX_PDF_BYTES = 10 * 1024 * 1024


class PDFExtractionError(AppError):
    status_code = 422
    code = "pdf_extraction_failed"


@router.post("/extract-pdf")
@limiter.limit(RENDER_LIMIT)
async def extract_pdf(request: Request, file: UploadFile = File(...)) -> ExtractPDFResponse:
    """Extract structured CV data from an uploaded resume PDF (offline heuristics, no AI key)."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise AppError("Only PDF files are accepted. Please upload a .pdf file.")

    contents = await file.read(MAX_PDF_BYTES + 1)
    if len(contents) > MAX_PDF_BYTES:
        raise AppError("File too large. Maximum size is 10MB.")
    if not contents:
        raise AppError("Uploaded file is empty.")
    if not contents.startswith(b"%PDF"):
        raise AppError("This file does not look like a valid PDF.")

    if not PDFExtractService.is_available():
        raise ServiceUnavailableError("PDF extraction is not available on this server.")

    try:
        result = await run_in_threadpool(PDFExtractService.extract_from_pdf, contents)
    except ValueError as error:
        # ValueErrors from the extractor carry user-facing messages.
        logger.info("PDF extraction rejected: %s", error)
        raise PDFExtractionError(str(error)) from error
    except Exception as error:
        logger.exception("PDF extraction failed")
        raise PDFExtractionError(
            "We couldn't read this PDF. Try exporting it again or use a text-based PDF."
        ) from error

    # LinkedIn exports have a fixed layout; a dedicated parser reads them far better.
    linkedin = parse_linkedin(result["raw_text"])
    if linkedin:
        result["cv_data"] = {**result["cv_data"], **{k: v for k, v in linkedin.items() if v}}
    imported = await run_in_threadpool(structure_resume, result["raw_text"], result["cv_data"])
    return ExtractPDFResponse(
        success=True,
        cv_data=imported.cv_data,
        raw_text_length=result["raw_text_length"],
        message=f"Successfully extracted data from {file.filename}",
        source=imported.source,
        warnings=imported.warnings,
        detected_format="linkedin" if linkedin else "resume",
    )
