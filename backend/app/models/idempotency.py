from datetime import datetime

from sqlalchemy import ForeignKey, Index, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.mysql import CHAR, DATETIME, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "scope",
            "idempotency_key",
            name="uq_idempotency_user_scope_key",
        ),
        Index("ix_idempotency_expires", "expires_at"),
    )

    id: Mapped[str] = mapped_column(CHAR(30), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        CHAR(30),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    scope: Mapped[str] = mapped_column(String(100), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    http_status: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    response_body: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        nullable=False,
        default=utc_now,
    )
