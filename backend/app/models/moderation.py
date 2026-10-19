from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String
from sqlalchemy.dialects.mysql import CHAR, DATETIME, INTEGER
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now


class ModerationRecord(Base):
    __tablename__ = "moderation_records"

    __table_args__ = (
        CheckConstraint(
            "target_type IN ('letter', 'response')",
            name="ck_moderation_records_target_type",
        ),
        CheckConstraint(
            "action IN ('submitted', 'approved', 'returned_for_edit', 'deleted')",
            name="ck_moderation_records_action",
        ),
        Index(
            "ix_moderation_target_created",
            "target_type",
            "target_id",
            "created_at",
        ),
    )

    id: Mapped[str] = mapped_column(CHAR(30), primary_key=True)
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    target_id: Mapped[str] = mapped_column(CHAR(30), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(
        CHAR(30),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    target_version: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        nullable=False,
        default=utc_now,
    )
