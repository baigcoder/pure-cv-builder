"""Job targeting: match a CV against a job post and tailor bullets to it."""

from dataclasses import asdict

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool

from core.limiter import AI_LIMIT, DEFAULT_LIMIT, limiter
from schemas.ai import (
    JobFetchRequest,
    JobFetchResponse,
    JobMatchRequest,
    JobMatchResponse,
    TailorBulletsRequest,
    TailorBulletsResponse,
)
from services import job_fetch_service, job_match_service, tailor_service

router = APIRouter(prefix="/job", tags=["job"])


@router.post("/match")
@limiter.limit(DEFAULT_LIMIT)
async def job_match(request: Request, payload: JobMatchRequest) -> JobMatchResponse:
    """Keyword coverage of the CV against a job post (offline, deterministic)."""
    result = job_match_service.analyze(payload.cv_data.model_dump(), payload.job_description, payload.target_role)
    return JobMatchResponse(**asdict(result))


@router.post("/tailor-bullets")
@limiter.limit(AI_LIMIT)
async def tailor_bullets(request: Request, payload: TailorBulletsRequest) -> TailorBulletsResponse:
    """Reworded bullets for the job (AI), or per-bullet keyword guidance."""
    result = await run_in_threadpool(
        tailor_service.tailor,
        payload.cv_data.model_dump(),
        payload.job_description,
        payload.keywords,
        payload.max_bullets,
    )
    return TailorBulletsResponse(**asdict(result))


@router.post("/fetch")
@limiter.limit(AI_LIMIT)
async def fetch_job(request: Request, payload: JobFetchRequest) -> JobFetchResponse:
    """Read a job posting from its link: title, company, location and description."""
    job = await run_in_threadpool(job_fetch_service.fetch_job, payload.url)
    return JobFetchResponse(**asdict(job))
