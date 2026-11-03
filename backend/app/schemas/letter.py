from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import APIModel
from app.schemas.metadata import MetadataOption, PatternOption


class UserPublic(APIModel):
    id: str
    username: str
    display_name: str
    avatar_url: str | None


class AuthorView(APIModel):
    display_name: str
    is_anonymous: bool


class RecipientView(APIModel):
    type: Literal["wall", "user"]
    user: UserPublic | None = None


class LetterSummary(APIModel):
    id: str
    title: str
    excerpt: str
    author: AuthorView
    recipient: RecipientView
    location: MetadataOption | None
    pattern: PatternOption
    status: Literal["draft", "active", "deleted"]
    visibility: Literal["public", "private"]
    submitted_at: datetime | None
    published_at: datetime | None
    resonance_count: int = 0
    favorite_count: int = 0
    response_count: int = 0
    reply_count: int = 0
    is_resonated: bool = False
    is_favorited: bool = False


class LetterRead(LetterSummary):
    content: str
    parent_letter_id: str | None
    allow_responses: bool
    allow_replies: bool
    created_at: datetime
    updated_at: datetime
    can_edit: bool
    can_delete: bool
    can_forward: bool = False
    review_note: str | None = None


class MyLetterSummary(LetterSummary):
    workflow_state: Literal[
        "draft",
        "pendingReview",
        "published",
        "returnedForEdit",
        "private",
    ]
    review_note: str | None = None
    created_at: datetime
    updated_at: datetime


class PaginationData(APIModel):
    page: int
    page_size: int
    total: int
    has_more: bool


class LetterListData(PaginationData):
    items: list[LetterSummary]


class MyLetterListData(PaginationData):
    items: list[MyLetterSummary]


class LetterResponse(APIModel):
    code: int = 0
    message: str = "success"
    data: LetterRead
    request_id: str


class LetterListResponse(APIModel):
    code: int = 0
    message: str = "success"
    data: LetterListData
    request_id: str


class MyLetterListResponse(APIModel):
    code: int = 0
    message: str = "success"
    data: MyLetterListData
    request_id: str


class LetterCreateRequest(APIModel):
    title: str = Field(default="", max_length=80)
    content: str = Field(default="", max_length=2000)
    recipient_type: Literal["wall", "user"] = "wall"
    recipient_user_id: str | None = None
    visibility: Literal["public", "private"] = "public"
    parent_letter_id: str | None = None
    pen_name: str | None = Field(default=None, max_length=30)
    is_anonymous: bool = False
    location_id: str | None = None
    pattern_id: str | None = None
    allow_responses: bool = True
    allow_replies: bool = True
    save_as_draft: bool


class LetterUpdateRequest(APIModel):
    title: str | None = Field(default=None, max_length=80)
    content: str | None = Field(default=None, max_length=2000)
    recipient_type: Literal["wall", "user"] | None = None
    recipient_user_id: str | None = None
    visibility: Literal["public", "private"] | None = None
    pen_name: str | None = Field(default=None, max_length=30)
    is_anonymous: bool | None = None
    location_id: str | None = None
    pattern_id: str | None = None
    allow_responses: bool | None = None
    allow_replies: bool | None = None
    submit_for_review: bool = False

    @model_validator(mode="after")
    def require_an_update(self) -> "LetterUpdateRequest":
        changed_fields = self.model_fields_set - {"submit_for_review"}
        if not changed_fields and not self.submit_for_review:
            raise ValueError("至少需要提供一个要修改的字段")
        return self


REVIEW_REASON_TAGS = (
    "色情低俗",
    "暴力血腥",
    "仇恨歧视与骚扰",
    "违法违规内容",
    "垃圾信息与恶意广告",
)
ReviewReason = Literal[
    "色情低俗",
    "暴力血腥",
    "仇恨歧视与骚扰",
    "违法违规内容",
    "垃圾信息与恶意广告",
]


class ReviewRequest(APIModel):
    action: Literal["approve", "returnForEdit", "delete"]
    reason: ReviewReason | None = None

    @model_validator(mode="after")
    def require_reason(self) -> "ReviewRequest":
        reason = self.reason.strip() if self.reason else None
        if self.action == "returnForEdit" and reason not in REVIEW_REASON_TAGS:
            raise ValueError("退回原因必须选择预设标签")
        if self.action == "delete" and reason not in REVIEW_REASON_TAGS:
            raise ValueError("删除原因必须选择预设标签")
        if self.action == "approve" and reason is not None:
            raise ValueError("审核通过时不能填写退回原因")
        self.reason = reason
        return self


class UserPublicListData(PaginationData):
    items: list[UserPublic]


class UserPublicListResponse(APIModel):
    code: int = 0
    message: str = "success"
    data: UserPublicListData
    request_id: str
