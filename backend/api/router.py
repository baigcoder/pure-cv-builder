from fastapi import APIRouter

from api.routes import ai, analyze, applications, cover_letter, job, pdf, render, resumes, sharing

api_router = APIRouter()
api_router.include_router(render.router)
api_router.include_router(cover_letter.router)
api_router.include_router(ai.router)
api_router.include_router(pdf.router)
api_router.include_router(resumes.router)
api_router.include_router(sharing.router)
api_router.include_router(applications.router)
api_router.include_router(job.router)
api_router.include_router(analyze.router)
