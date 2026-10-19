from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AuthContext, get_auth_context
from app.core.database import get_db
from app.models import Letter
from app.schemas.letter import MyLetterListData, MyLetterListResponse
from app.services.letters import (
    build_my_letter_summary,
    get_workflow_state,
    validate_page,
)


router = APIRouter(prefix="/me", tags=["Me"])


@router.get("/letters", response_model=MyLetterListResponse)
def list_my_letters(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=50),
    status: Literal["draft", "active", "deleted"] | None = None,
    workflow_state: Literal[
        "draft",
        "pendingReview",
        "published",
        "returnedForEdit",
    ]
    | None = Query(default=None, alias="workflowState"),
    auth_context: AuthContext = Depends(get_auth_context),
    database_session: Session = Depends(get_db),
) -> MyLetterListResponse:
    validate_page(page, page_size)
    statement = select(Letter).where(
        Letter.author_id == auth_context.user.id,
        Letter.deleted_at.is_(None),
        Letter.status != "deleted",
    )
    if status is not None:
        statement = statement.where(Letter.status == status)

    letters = database_session.scalars(
        statement.order_by(Letter.updated_at.desc(), Letter.id.desc())
    ).all()
    if workflow_state is not None:
        letters = [
            item
            for item in letters
            if get_workflow_state(database_session, item) == workflow_state
        ]

    total = len(letters)
    start = (page - 1) * page_size
    page_items = letters[start : start + page_size]
    return MyLetterListResponse(
        data=MyLetterListData(
            items=[
                build_my_letter_summary(database_session, item)
                for item in page_items
            ],
            page=page,
            page_size=page_size,
            total=total,
            has_more=page * page_size < total,
        ),
        request_id=request.state.request_id,
    )
