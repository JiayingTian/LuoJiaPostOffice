from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import (
    AuthContext,
    require_admin,
    require_admin_with_csrf,
)
from app.core.database import get_db
from app.core.errors import raise_api_error
from app.models import Letter
from app.models.base import utc_now
from app.schemas.letter import (
    LetterListData,
    LetterListResponse,
    LetterResponse,
    ReviewRequest,
)
from app.services.letters import (
    add_moderation_record,
    build_letter_read,
    build_letter_summary,
    validate_page,
)


router = APIRouter(prefix="/admin", tags=["Admin"])


def _pending_conditions() -> tuple:
    return (
        Letter.status == "active",
        Letter.visibility == "public",
        Letter.submitted_at.is_not(None),
        Letter.published_at.is_(None),
        Letter.deleted_at.is_(None),
    )


@router.get("/letters", response_model=LetterListResponse)
def list_letters_for_review(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=50),
    auth_context: AuthContext = Depends(require_admin),
    database_session: Session = Depends(get_db),
) -> LetterListResponse:
    del auth_context
    validate_page(page, page_size)
    total = int(
        database_session.scalar(
            select(func.count()).select_from(Letter).where(*_pending_conditions())
        )
        or 0
    )
    letters = database_session.scalars(
        select(Letter)
        .where(*_pending_conditions())
        .order_by(Letter.submitted_at.asc(), Letter.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return LetterListResponse(
        data=LetterListData(
            items=[build_letter_summary(database_session, item) for item in letters],
            page=page,
            page_size=page_size,
            total=total,
            has_more=page * page_size < total,
        ),
        request_id=request.state.request_id,
    )


@router.post("/letters/{letterId}/review", response_model=LetterResponse)
def review_letter(
    letter_id: Annotated[str, Path(alias="letterId")],
    payload: ReviewRequest,
    request: Request,
    auth_context: AuthContext = Depends(require_admin_with_csrf),
    database_session: Session = Depends(get_db),
) -> LetterResponse:
    try:
        letter = database_session.get(Letter, letter_id)
        if (
            letter is None
            or letter.visibility != "public"
            or letter.deleted_at is not None
        ):
            raise_api_error(404, 40401, "信件不存在")

        is_pending = (
            letter.status == "active"
            and letter.submitted_at is not None
            and letter.published_at is None
        )
        if payload.action in {"approve", "returnForEdit"} and not is_pending:
            raise_api_error(409, 40901, "该版本已经完成审核或不在审核队列中")

        now = utc_now()
        letter.version += 1
        letter.updated_at = now

        if payload.action == "approve":
            letter.status = "active"
            letter.published_at = now
            action = "approved"
        elif payload.action == "returnForEdit":
            letter.status = "draft"
            letter.submitted_at = None
            letter.published_at = None
            action = "returned_for_edit"
        else:
            if letter.status == "deleted":
                raise_api_error(409, 40901, "信件已经删除")
            letter.status = "deleted"
            letter.deleted_at = now
            letter.published_at = None
            action = "deleted"

        add_moderation_record(
            database_session,
            letter,
            auth_context.user.id,
            action,
            payload.reason,
        )
        database_session.flush()
        response = LetterResponse(
            data=build_letter_read(database_session, letter, auth_context.user),
            request_id=request.state.request_id,
        )
        database_session.commit()
        return response
    except Exception:
        database_session.rollback()
        raise
