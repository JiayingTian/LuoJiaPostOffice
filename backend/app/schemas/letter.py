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
    ]
    review_note: str | None = None


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
    content: str = Field(default="", max_length=1500)
    recipient_type: Literal["wall", "user"] = "wall"
    recipient_user_id: str | None = None
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
    content: str | None = Field(default=None, max_length=1500)
    recipient_type: Literal["wall", "user"] | None = None
    recipient_user_id: str | None = None
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


class ReviewRequest(APIModel):
    action: Literal["approve", "returnForEdit", "delete"]
    reason: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def require_reason(self) -> "ReviewRequest":
        if self.action in {"returnForEdit", "delete"}:
            if not self.reason or not self.reason.strip():
                raise ValueError("退回修改或删除时必须填写原因")
        return self
