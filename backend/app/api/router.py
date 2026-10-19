from fastapi import APIRouter

from app.api.routes.admin import router as admin_router
from app.api.routes.auth import router as auth_router
from app.api.routes.letters import router as letters_router
from app.api.routes.me import router as me_router
from app.api.routes.metadata import router as metadata_router


api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(metadata_router)
api_router.include_router(letters_router)
api_router.include_router(me_router)
api_router.include_router(admin_router)
