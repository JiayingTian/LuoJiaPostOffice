from datetime import datetime

from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.mysql import CHAR, DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now


class SessionRecord(Base):
    __tablename__ = "sessions"

    __table_args__ = (
        UniqueConstraint(
            "session_token_hash",
            name="uq_sessions_token_hash",
        ),
        Index(
            "ix_sessions_user_expires",
            "user_id",
            "expires_at",
        ),
    )

    id: Mapped[str] = mapped_column(
        CHAR(30),
        primary_key=True,
    )

    user_id: Mapped[str] = mapped_column(
        CHAR(30),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    session_token_hash: Mapped[str] = mapped_column(
        CHAR(64),
        nullable=False,
    )

    csrf_token_hash: Mapped[str] = mapped_column(
        CHAR(64),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        nullable=False,
    )

    last_seen_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        nullable=False,
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        DATETIME(fsp=6),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        default=utc_now,
        nullable=False,
    )