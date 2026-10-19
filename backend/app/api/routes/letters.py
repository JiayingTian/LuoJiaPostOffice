from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Path, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.api.dependencies.auth import (
    AuthContext,
    get_optional_auth_context,
    require_csrf,
)
from app.core.database import get_db
from app.core.errors import raise_api_error
from app.core.ids import new_id
from app.models import Letter, Location
from app.models.base import utc_now
from app.schemas.common import EmptyResponse
from app.schemas.letter import (
    LetterCreateRequest,
    LetterListData,
    LetterListResponse,
    LetterResponse,
    LetterUpdateRequest,
)
from app.services.idempotency import (
    begin_idempotent_request,
    finish_idempotent_request,
)
from app.services.letters import (
    add_moderation_record,
    build_letter_read,
    build_letter_summary,
    resolve_location,
    resolve_parent_letter,
    resolve_pattern,
    validate_page,
    validate_submission,
    validate_wall_recipient,
)


router = APIRouter(prefix="/letters", tags=["Letters"])


def _public_conditions() -> tuple:
    return (
        Letter.status == "active",
        Letter.visibility == "public",
        Letter.published_at.is_not(None),
        Letter.deleted_at.is_(None),
    )


@router.get("", response_model=LetterListResponse)
def list_letters(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=50),
    sort: Literal["latest", "popular", "mostReplied"] = "latest",
    keyword: str | None = Query(default=None, max_length=50),
    location_id: str | None = Query(default=None, alias="locationId"),
    has_replies: bool | None = Query(default=None, alias="hasReplies"),
    database_session: Session = Depends(get_db),
) -> LetterListResponse:
    validate_page(page, page_size)
    reply = aliased(Letter)
    reply_count = (
        select(func.count(reply.id))
        .where(
            reply.parent_letter_id == Letter.id,
            reply.status == "active",
            reply.visibility == "public",
            reply.published_at.is_not(None),
            reply.deleted_at.is_(None),
        )
        .correlate(Letter)
        .scalar_subquery()
    )

    statement = select(Letter).where(*_public_conditions())
    if keyword and keyword.strip():
        search = f"%{keyword.strip()}%"
        statement = statement.outerjoin(Location, Letter.location_id == Location.id)
        statement = statement.where(
            or_(
                Letter.title.like(search),
                Letter.content.like(search),
                Location.name.like(search),
            )
        )
    if location_id:
        statement = statement.where(Letter.location_id == location_id)
    if has_replies is True:
        statement = statement.where(reply_count > 0)
    elif has_replies is False:
        statement = statement.where(reply_count == 0)

    total = int(
        database_session.scalar(
            select(func.count()).select_from(statement.order_by(None).subquery())
        )
        or 0
    )

    if sort == "mostReplied":
        statement = statement.order_by(
            reply_count.desc(),
            Letter.published_at.desc(),
            Letter.id.desc(),
        )
    else:
        # 共鸣表尚未进入本轮范围，因此 popular 与 latest 暂时拥有相同稳定排序。
        statement = statement.order_by(Letter.published_at.desc(), Letter.id.desc())

    letters = database_session.scalars(
        statement.offset((page - 1) * page_size).limit(page_size)
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


@router.post("", response_model=LetterResponse, status_code=201)
def create_letter(
    payload: LetterCreateRequest,
    request: Request,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=16, max_length=128),
    ],
    auth_context: AuthContext = Depends(require_csrf),
    database_session: Session = Depends(get_db),
) -> LetterResponse | JSONResponse:
    try:
        idempotency_record, replay = begin_idempotent_request(
            database_session,
            auth_context.user.id,
            "POST /api/v1/letters",
            idempotency_key,
            payload,
        )
        if replay is not None:
            database_session.rollback()
            return JSONResponse(
                status_code=idempotency_record.http_status or 201,
                content=replay,
            )

        validate_wall_recipient(payload.recipient_type, payload.recipient_user_id)
        pattern = resolve_pattern(database_session, payload.pattern_id)
        location = resolve_location(database_session, payload.location_id)
        parent = resolve_parent_letter(database_session, payload.parent_letter_id)

        letter = Letter(
            id=new_id("let"),
            author_id=auth_context.user.id,
            parent_letter_id=parent.id if parent else None,
            recipient_type="wall",
            recipient_user_id=None,
            title=payload.title,
            content=payload.content,
            pen_name=payload.pen_name,
            is_anonymous=payload.is_anonymous,
            location_id=location.id if location else None,
            pattern_id=pattern.id,
            status="draft" if payload.save_as_draft else "active",
            visibility="public",
            allow_responses=payload.allow_responses,
            allow_replies=payload.allow_replies,
            submitted_at=None if payload.save_as_draft else utc_now(),
            published_at=None,
        )
        if not payload.save_as_draft:
            validate_submission(letter)

        database_session.add(letter)
        database_session.flush()
        if not payload.save_as_draft:
            add_moderation_record(
                database_session,
                letter,
                auth_context.user.id,
                "submitted",
            )

        response = LetterResponse(
            data=build_letter_read(database_session, letter, auth_context.user),
            request_id=request.state.request_id,
        )
        response_body = response.model_dump(mode="json", by_alias=True)
        finish_idempotent_request(idempotency_record, 201, response_body)
        database_session.commit()
        return response
    except Exception:
        database_session.rollback()
        raise


@router.get("/{letterId}", response_model=LetterResponse)
def get_letter(
    letter_id: Annotated[str, Path(alias="letterId")],
    request: Request,
    auth_context: AuthContext | None = Depends(get_optional_auth_context),
    database_session: Session = Depends(get_db),
) -> LetterResponse:
    letter = database_session.get(Letter, letter_id)
    if letter is None or letter.status == "deleted" or letter.deleted_at is not None:
        raise_api_error(404, 40401, "信件不存在")

    is_public = (
        letter.status == "active"
        and letter.visibility == "public"
        and letter.published_at is not None
    )
    viewer = auth_context.user if auth_context else None
    is_author = viewer is not None and viewer.id == letter.author_id
    is_review_admin = (
        viewer is not None
        and viewer.role == "admin"
        and letter.visibility == "public"
        and letter.submitted_at is not None
        and letter.published_at is None
    )
    if not (is_public or is_author or is_review_admin):
        raise_api_error(404, 40401, "信件不存在")

    return LetterResponse(
        data=build_letter_read(database_session, letter, viewer),
        request_id=request.state.request_id,
    )


@router.patch("/{letterId}", response_model=LetterResponse)
def update_letter(
    letter_id: Annotated[str, Path(alias="letterId")],
    payload: LetterUpdateRequest,
    request: Request,
    auth_context: AuthContext = Depends(require_csrf),
    database_session: Session = Depends(get_db),
) -> LetterResponse:
    try:
        letter = database_session.get(Letter, letter_id)
        if letter is None or letter.deleted_at is not None or letter.status == "deleted":
            raise_api_error(404, 40401, "信件不存在")
        if letter.author_id != auth_context.user.id:
            raise_api_error(404, 40401, "信件不存在")
        if (
            letter.status == "active"
            and letter.submitted_at is not None
            and letter.published_at is None
        ):
            raise_api_error(409, 40901, "待审核信件暂时不能修改")

        changed_fields = payload.model_fields_set - {"submit_for_review"}
        was_published = letter.published_at is not None

        if "title" in changed_fields:
            if payload.title is None:
                raise_api_error(
                    422,
                    42201,
                    "标题无效",
                    {"fieldErrors": {"title": "标题不能为 null"}},
                )
            letter.title = payload.title
        if "content" in changed_fields:
            if payload.content is None:
                raise_api_error(
                    422,
                    42201,
                    "正文无效",
                    {"fieldErrors": {"content": "正文不能为 null"}},
                )
            letter.content = payload.content
        if "recipient_type" in changed_fields:
            validate_wall_recipient(
                payload.recipient_type or "",
                payload.recipient_user_id,
            )
            letter.recipient_type = "wall"
            letter.recipient_user_id = None
        if "recipient_user_id" in changed_fields and payload.recipient_user_id is not None:
            validate_wall_recipient(letter.recipient_type, payload.recipient_user_id)
        if "pen_name" in changed_fields:
            letter.pen_name = payload.pen_name
        if "is_anonymous" in changed_fields:
            if payload.is_anonymous is None:
                raise_api_error(422, 42201, "isAnonymous 不能为 null")
            letter.is_anonymous = payload.is_anonymous
        if "location_id" in changed_fields:
            location = resolve_location(
                database_session,
                payload.location_id,
                letter.location_id,
            )
            letter.location_id = location.id if location else None
        if "pattern_id" in changed_fields:
            if payload.pattern_id is None:
                raise_api_error(
                    422,
                    42201,
                    "信纸图案无效",
                    {"fieldErrors": {"patternId": "patternId 不能为 null"}},
                )
            pattern = resolve_pattern(
                database_session,
                payload.pattern_id,
                letter.pattern_id,
            )
            letter.pattern_id = pattern.id
        if "allow_responses" in changed_fields:
            if payload.allow_responses is None:
                raise_api_error(422, 42201, "allowResponses 不能为 null")
            letter.allow_responses = payload.allow_responses
        if "allow_replies" in changed_fields:
            if payload.allow_replies is None:
                raise_api_error(422, 42201, "allowReplies 不能为 null")
            letter.allow_replies = payload.allow_replies

        if changed_fields:
            letter.version += 1
            letter.updated_at = utc_now()
            if was_published:
                letter.status = "draft"
                letter.submitted_at = None
                letter.published_at = None

        if payload.submit_for_review:
            resolve_parent_letter(database_session, letter.parent_letter_id)
            validate_submission(letter)
            letter.status = "active"
            letter.submitted_at = utc_now()
            letter.published_at = None
            if not changed_fields:
                letter.version += 1
                letter.updated_at = utc_now()
            add_moderation_record(
                database_session,
                letter,
                auth_context.user.id,
                "submitted",
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


@router.delete("/{letterId}", response_model=EmptyResponse)
def delete_letter(
    letter_id: Annotated[str, Path(alias="letterId")],
    request: Request,
    auth_context: AuthContext = Depends(require_csrf),
    database_session: Session = Depends(get_db),
) -> EmptyResponse:
    try:
        letter = database_session.get(Letter, letter_id)
        if letter is None or letter.deleted_at is not None or letter.status == "deleted":
            raise_api_error(404, 40401, "信件不存在")
        if letter.author_id != auth_context.user.id:
            raise_api_error(404, 40401, "信件不存在")

        letter.status = "deleted"
        letter.deleted_at = utc_now()
        letter.published_at = None
        letter.version += 1
        add_moderation_record(
            database_session,
            letter,
            auth_context.user.id,
            "deleted",
            "作者删除",
        )
        database_session.commit()
        return EmptyResponse(request_id=request.state.request_id)
    except Exception:
        database_session.rollback()
        raise


@router.get("/{letterId}/replies", response_model=LetterListResponse)
def list_letter_replies(
    letter_id: Annotated[str, Path(alias="letterId")],
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=50),
    database_session: Session = Depends(get_db),
) -> LetterListResponse:
    validate_page(page, page_size)
    parent = database_session.get(Letter, letter_id)
    if (
        parent is None
        or parent.status != "active"
        or parent.visibility != "public"
        or parent.published_at is None
        or parent.deleted_at is not None
    ):
        raise_api_error(404, 40401, "信件不存在")

    conditions = (*_public_conditions(), Letter.parent_letter_id == letter_id)
    total = int(
        database_session.scalar(
            select(func.count()).select_from(Letter).where(*conditions)
        )
        or 0
    )
    letters = database_session.scalars(
        select(Letter)
        .where(*conditions)
        .order_by(Letter.published_at.asc(), Letter.id.asc())
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
