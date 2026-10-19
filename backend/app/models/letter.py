from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.dialects.mysql import CHAR, DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BusinessRecordMixin


class Letter(BusinessRecordMixin, Base):
    __tablename__ = "letters"

    __table_args__ = (
        CheckConstraint(
            "recipient_type IN ('wall', 'user')",
            name="ck_letters_recipient_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'deleted')",
            name="ck_letters_status",
        ),
        CheckConstraint(
            "visibility IN ('public', 'private')",
            name="ck_letters_visibility",
        ),
        CheckConstraint(
            "(recipient_type = 'wall' AND recipient_user_id IS NULL "
            "AND visibility = 'public') OR "
            "(recipient_type = 'user' AND recipient_user_id IS NOT NULL "
            "AND visibility = 'private')",
            name="ck_letters_recipient_visibility",
        ),
        Index(
            "ix_letters_public_list",
            "visibility",
            "status",
            "published_at",
            "id",
        ),
        Index(
            "ix_letters_review_queue",
            "visibility",
            "status",
            "submitted_at",
            "published_at",
        ),
        Index(
            "ix_letters_author_status_updated",
            "author_id",
            "status",
            "updated_at",
            "id",
        ),
        Index(
            "ix_letters_recipient_status_updated",
            "recipient_user_id",
            "status",
            "updated_at",
            "id",
        ),
        Index(
            "ix_letters_location_published",
            "location_id",
            "published_at",
            "id",
        ),
        Index(
            "ix_letters_parent_published",
            "parent_letter_id",
            "published_at",
            "id",
        ),
    )

    id: Mapped[str] = mapped_column(CHAR(30), primary_key=True)
    author_id: Mapped[str] = mapped_column(
        CHAR(30),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    parent_letter_id: Mapped[str | None] = mapped_column(
        CHAR(30),
        ForeignKey("letters.id", ondelete="RESTRICT"),
        nullable=True,
    )
    recipient_type: Mapped[str] = mapped_column(String(16), nullable=False)
    recipient_user_id: Mapped[str | None] = mapped_column(
        CHAR(30),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    pen_name: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    location_id: Mapped[str | None] = mapped_column(
        CHAR(30),
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=True,
    )
    pattern_id: Mapped[str] = mapped_column(
        CHAR(30),
        ForeignKey("patterns.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    visibility: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="public",
    )
    allow_responses: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_replies: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    submitted_at: Mapped[datetime | None] = mapped_column(
        DATETIME(fsp=6),
        nullable=True,
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DATETIME(fsp=6),
        nullable=True,
    )
