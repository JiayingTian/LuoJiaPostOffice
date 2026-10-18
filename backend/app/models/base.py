from datetime import UTC, datetime

from sqlalchemy.dialects.mysql import DATETIME, INTEGER
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class BusinessRecordMixin:
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        default=utc_now,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
        DATETIME(fsp=6),
        nullable=True,
    )

    version: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        default=1,
        nullable=False,
    )