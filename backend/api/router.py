from fastapi import APIRouter

from api.routes import ai, cover_letter, pdf, render

api_router = APIRouter()
api_router.include_router(render.router)
api_router.include_router(cover_letter.router)
api_router.include_router(ai.router)
api_router.include_router(pdf.router)
