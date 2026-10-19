import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import raise_api_error
from app.core.ids import new_id
from app.models import Letter, Location, ModerationRecord, Pattern, User
from app.schemas.letter import (
    AuthorView,
    LetterRead,
    LetterSummary,
    MyLetterSummary,
    RecipientView,
    UserPublic,
)
from app.schemas.metadata import MetadataOption, PatternOption


def validate_page(page: int, page_size: int) -> None:
    if page < 1:
        raise_api_error(400, 40001, "page 必须从 1 开始")
    if page_size < 1 or page_size > 50:
        raise_api_error(400, 40001, "pageSize 必须为 1 至 50")


def resolve_pattern(
    database_session: Session,
    pattern_id: str | None,
    existing_pattern_id: str | None = None,
) -> Pattern:
    if pattern_id is not None:
        pattern = database_session.get(Pattern, pattern_id)
        if pattern is None or (
            not pattern.is_enabled and pattern.id != existing_pattern_id
        ):
            raise_api_error(
                422,
                42201,
                "信纸图案无效",
                {"fieldErrors": {"patternId": "请选择可用的信纸图案"}},
            )
        return pattern

    patterns = database_session.scalars(
        select(Pattern)
        .where(Pattern.is_enabled.is_(True))
        .order_by(Pattern.sort_order.asc(), Pattern.id.asc())
        .limit(2)
    ).all()
    if len(patterns) != 1:
        raise_api_error(
            422,
            42201,
            "需要选择信纸图案",
            {"fieldErrors": {"patternId": "请选择信纸图案"}},
        )
    return patterns[0]


def resolve_location(
    database_session: Session,
    location_id: str | None,
    existing_location_id: str | None = None,
) -> Location | None:
    if location_id is None:
        return None
    location = database_session.get(Location, location_id)
    if location is None or (
        not location.is_enabled and location.id != existing_location_id
    ):
        raise_api_error(
            422,
            42201,
            "地点无效",
            {"fieldErrors": {"locationId": "请选择可用地点或不选择地点"}},
        )
    return location


def resolve_parent_letter(
    database_session: Session,
    parent_letter_id: str | None,
) -> Letter | None:
    if parent_letter_id is None:
        return None
    parent = database_session.get(Letter, parent_letter_id)
    if (
        parent is None
        or parent.status != "active"
        or parent.visibility != "public"
        or parent.published_at is None
        or parent.deleted_at is not None
    ):
        raise_api_error(
            422,
            42201,
            "原信不可回信",
            {"fieldErrors": {"parentLetterId": "原信不存在或尚未公开"}},
        )
    if parent.parent_letter_id is not None:
        raise_api_error(
            422,
            42201,
            "首版只允许一层完整回信",
            {"fieldErrors": {"parentLetterId": "不能继续回复一封回信"}},
        )
    if not parent.allow_replies:
        raise_api_error(
            422,
            42201,
            "原信已关闭完整回信",
            {"fieldErrors": {"parentLetterId": "原信不允许完整回信"}},
        )
    return parent


def validate_wall_recipient(
    recipient_type: str,
    recipient_user_id: str | None,
) -> None:
    field_errors: dict[str, str] = {}
    if recipient_type != "wall":
        field_errors["recipientType"] = "本轮只支持投递信墙"
    if recipient_user_id is not None:
        field_errors["recipientUserId"] = "投递信墙时必须为空"
    if field_errors:
        raise_api_error(422, 42201, "收信目标无效", {"fieldErrors": field_errors})


def validate_submission(letter: Letter) -> None:
    field_errors: dict[str, str] = {}
    title = letter.title.strip()
    content = letter.content.strip()

    if len(title) < 2 or len(title) > 80:
        field_errors["title"] = "标题必须为 2 至 80 个字符"
    if len(content) < 20 or len(content) > 1500:
        field_errors["content"] = "正文必须为 20 至 1500 个字符"
    if letter.recipient_type != "wall":
        field_errors["recipientType"] = "本轮只支持投递信墙"
    if letter.recipient_user_id is not None:
        field_errors["recipientUserId"] = "投递信墙时必须为空"
    if not letter.pattern_id:
        field_errors["patternId"] = "请选择信纸图案"

    if field_errors:
        raise_api_error(
            422,
            42201,
            "信件内容未通过校验",
            {"fieldErrors": field_errors},
        )

    letter.title = title
    letter.content = content


def add_moderation_record(
    database_session: Session,
    letter: Letter,
    actor_user_id: str,
    action: str,
    reason: str | None = None,
) -> ModerationRecord:
    record = ModerationRecord(
        id=new_id("mod"),
        target_type="letter",
        target_id=letter.id,
        actor_user_id=actor_user_id,
        action=action,
        reason=reason.strip() if reason else None,
        target_version=letter.version,
    )
    database_session.add(record)
    return record


def get_latest_moderation_record(
    database_session: Session,
    letter_id: str,
) -> ModerationRecord | None:
    return database_session.scalar(
        select(ModerationRecord)
        .where(
            ModerationRecord.target_type == "letter",
            ModerationRecord.target_id == letter_id,
        )
        .order_by(
            ModerationRecord.created_at.desc(),
            ModerationRecord.id.desc(),
        )
        .limit(1)
    )


def get_review_note(database_session: Session, letter_id: str) -> str | None:
    latest_record = get_latest_moderation_record(database_session, letter_id)
    if latest_record is None or latest_record.action != "returned_for_edit":
        return None
    return latest_record.reason


def get_workflow_state(database_session: Session, letter: Letter) -> str:
    if letter.status == "active" and letter.published_at is not None:
        return "published"
    if (
        letter.status == "active"
        and letter.submitted_at is not None
        and letter.published_at is None
    ):
        return "pendingReview"
    if letter.status == "draft":
        latest_record = get_latest_moderation_record(database_session, letter.id)
        if latest_record is not None and latest_record.action == "returned_for_edit":
            return "returnedForEdit"
    return "draft"


def _excerpt(content: str) -> str:
    normalized = re.sub(r"\s+", " ", content).strip()
    return normalized[:120]


def _author_view(database_session: Session, letter: Letter) -> AuthorView:
    if letter.is_anonymous:
        return AuthorView(display_name="一位珞珈来客", is_anonymous=True)
    author = database_session.get(User, letter.author_id)
    display_name = letter.pen_name or (author.display_name if author else "已注销用户")
    return AuthorView(display_name=display_name, is_anonymous=False)


def _recipient_view(database_session: Session, letter: Letter) -> RecipientView:
    if letter.recipient_type == "wall":
        return RecipientView(type="wall", user=None)
    recipient = database_session.get(User, letter.recipient_user_id)
    user = None
    if recipient is not None:
        user = UserPublic.model_validate(recipient)
    return RecipientView(type="user", user=user)


def _location_view(
    database_session: Session,
    letter: Letter,
) -> MetadataOption | None:
    if letter.location_id is None:
        return None
    location = database_session.get(Location, letter.location_id)
    return MetadataOption.model_validate(location) if location else None


def _pattern_view(database_session: Session, letter: Letter) -> PatternOption:
    pattern = database_session.get(Pattern, letter.pattern_id)
    if pattern is None:
        raise RuntimeError(f"Letter {letter.id} references a missing pattern")
    return PatternOption.model_validate(pattern)


def _reply_count(database_session: Session, letter_id: str) -> int:
    return int(
        database_session.scalar(
            select(func.count())
            .select_from(Letter)
            .where(
                Letter.parent_letter_id == letter_id,
                Letter.status == "active",
                Letter.visibility == "public",
                Letter.published_at.is_not(None),
                Letter.deleted_at.is_(None),
            )
        )
        or 0
    )


def build_letter_summary(
    database_session: Session,
    letter: Letter,
) -> LetterSummary:
    return LetterSummary(
        id=letter.id,
        title=letter.title,
        excerpt=_excerpt(letter.content),
        author=_author_view(database_session, letter),
        recipient=_recipient_view(database_session, letter),
        location=_location_view(database_session, letter),
        pattern=_pattern_view(database_session, letter),
        status=letter.status,
        visibility=letter.visibility,
        submitted_at=letter.submitted_at,
        published_at=letter.published_at,
        reply_count=_reply_count(database_session, letter.id),
    )


def build_letter_read(
    database_session: Session,
    letter: Letter,
    viewer: User | None,
) -> LetterRead:
    summary = build_letter_summary(database_session, letter)
    is_author = viewer is not None and viewer.id == letter.author_id
    is_admin = viewer is not None and viewer.role == "admin"
    review_note = None
    if is_author or is_admin:
        review_note = get_review_note(database_session, letter.id)

    can_edit = is_author and letter.status != "deleted" and (
        letter.status == "draft" or letter.published_at is not None
    )

    return LetterRead(
        **summary.model_dump(),
        content=letter.content,
        parent_letter_id=letter.parent_letter_id,
        allow_responses=letter.allow_responses,
        allow_replies=letter.allow_replies,
        created_at=letter.created_at,
        updated_at=letter.updated_at,
        can_edit=can_edit,
        can_delete=is_author and letter.status != "deleted",
        can_forward=False,
        review_note=review_note,
    )


def build_my_letter_summary(
    database_session: Session,
    letter: Letter,
) -> MyLetterSummary:
    summary = build_letter_summary(database_session, letter)
    workflow_state = get_workflow_state(database_session, letter)
    review_note = None
    if workflow_state == "returnedForEdit":
        review_note = get_review_note(database_session, letter.id)
    return MyLetterSummary(
        **summary.model_dump(),
        workflow_state=workflow_state,
        review_note=review_note,
    )
