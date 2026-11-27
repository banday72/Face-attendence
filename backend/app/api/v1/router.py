from fastapi import APIRouter

from app.api.v1.endpoints import (
    academic,
    admin,
    admin_timetable,
    attendance,
    auth,
    corrections,
    face,
    health,
    professor_tools,
    profile,
    reports,
    sessions,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(admin_timetable.router)
api_router.include_router(academic.router)
api_router.include_router(sessions.router)
api_router.include_router(corrections.router)
api_router.include_router(attendance.router)
api_router.include_router(face.router)
api_router.include_router(professor_tools.router)
api_router.include_router(profile.router)
api_router.include_router(reports.router)
api_router.include_router(health.router)
