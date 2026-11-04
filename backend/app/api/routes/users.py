from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AuthContext, get_auth_context
from app.core.database import get_db
from app.models import User
from app.schemas.letter import UserPublic, UserPublicListData, UserPublicListResponse
from app.services.letters import validate_page


router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/search", response_model=UserPublicListResponse)
def search_users(
    request: Request,
    keyword: str = Query(min_length=1, max_length=50),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=50),
    auth_context: AuthContext = Depends(get_auth_context),
    database_session: Session = Depends(get_db),
) -> UserPublicListResponse:
    del auth_context
    validate_page(page, page_size)
    search = f"%{keyword.strip()}%"
    conditions = (
        User.is_active.is_(True),
        User.deleted_at.is_(None),
        or_(User.username.like(search), User.display_name.like(search)),
    )
    total = int(
        database_session.scalar(
            select(func.count()).select_from(User).where(*conditions)
        )
        or 0
    )
    users = database_session.scalars(
        select(User)
        .where(*conditions)
        .order_by(User.username.asc(), User.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return UserPublicListResponse(
        data=UserPublicListData(
            items=[UserPublic.model_validate(user) for user in users],
            page=page,
            page_size=page_size,
            total=total,
            has_more=page * page_size < total,
        ),
        request_id=request.state.request_id,
    )
