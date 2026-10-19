"""create letter core tables

Revision ID: f284c71a9e30
Revises: d64158b30f7a
Create Date: 2026-10-19 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = "f284c71a9e30"
down_revision: Union[str, Sequence[str], None] = "d64158b30f7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "letters",
        sa.Column("id", mysql.CHAR(length=30), nullable=False),
        sa.Column("author_id", mysql.CHAR(length=30), nullable=False),
        sa.Column("parent_letter_id", mysql.CHAR(length=30), nullable=True),
        sa.Column("recipient_type", sa.String(length=16), nullable=False),
        sa.Column("recipient_user_id", mysql.CHAR(length=30), nullable=True),
        sa.Column("title", sa.String(length=80), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("pen_name", sa.String(length=30), nullable=True),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False),
        sa.Column("location_id", mysql.CHAR(length=30), nullable=True),
        sa.Column("pattern_id", mysql.CHAR(length=30), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("visibility", sa.String(length=16), nullable=False),
        sa.Column("allow_responses", sa.Boolean(), nullable=False),
        sa.Column("allow_replies", sa.Boolean(), nullable=False),
        sa.Column("submitted_at", mysql.DATETIME(fsp=6), nullable=True),
        sa.Column("published_at", mysql.DATETIME(fsp=6), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("updated_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("deleted_at", mysql.DATETIME(fsp=6), nullable=True),
        sa.Column("version", mysql.INTEGER(unsigned=True), nullable=False),
        sa.CheckConstraint(
            "recipient_type IN ('wall', 'user')",
            name="ck_letters_recipient_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'deleted')",
            name="ck_letters_status",
        ),
        sa.CheckConstraint(
            "visibility IN ('public', 'private')",
            name="ck_letters_visibility",
        ),
        sa.CheckConstraint(
            "(recipient_type = 'wall' AND recipient_user_id IS NULL "
            "AND visibility = 'public') OR "
            "(recipient_type = 'user' AND recipient_user_id IS NOT NULL "
            "AND visibility = 'private')",
            name="ck_letters_recipient_visibility",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["parent_letter_id"],
            ["letters.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["pattern_id"],
            ["patterns.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_letters_public_list",
        "letters",
        ["visibility", "status", "published_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_letters_review_queue",
        "letters",
        ["visibility", "status", "submitted_at", "published_at"],
        unique=False,
    )
    op.create_index(
        "ix_letters_author_status_updated",
        "letters",
        ["author_id", "status", "updated_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_letters_recipient_status_updated",
        "letters",
        ["recipient_user_id", "status", "updated_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_letters_location_published",
        "letters",
        ["location_id", "published_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_letters_parent_published",
        "letters",
        ["parent_letter_id", "published_at", "id"],
        unique=False,
    )

    op.create_table(
        "moderation_records",
        sa.Column("id", mysql.CHAR(length=30), nullable=False),
        sa.Column("target_type", sa.String(length=16), nullable=False),
        sa.Column("target_id", mysql.CHAR(length=30), nullable=False),
        sa.Column("actor_user_id", mysql.CHAR(length=30), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=True),
        sa.Column("target_version", mysql.INTEGER(unsigned=True), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.CheckConstraint(
            "target_type IN ('letter', 'response')",
            name="ck_moderation_records_target_type",
        ),
        sa.CheckConstraint(
            "action IN ('submitted', 'approved', 'returned_for_edit', 'deleted')",
            name="ck_moderation_records_action",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_moderation_target_created",
        "moderation_records",
        ["target_type", "target_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "idempotency_records",
        sa.Column("id", mysql.CHAR(length=30), nullable=False),
        sa.Column("user_id", mysql.CHAR(length=30), nullable=False),
        sa.Column("scope", sa.String(length=100), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", mysql.CHAR(length=64), nullable=False),
        sa.Column("http_status", sa.SmallInteger(), nullable=True),
        sa.Column("response_body", mysql.JSON(), nullable=True),
        sa.Column("expires_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "scope",
            "idempotency_key",
            name="uq_idempotency_user_scope_key",
        ),
    )
    op.create_index(
        "ix_idempotency_expires",
        "idempotency_records",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_idempotency_expires", table_name="idempotency_records")
    op.drop_table("idempotency_records")
    op.drop_index("ix_moderation_target_created", table_name="moderation_records")
    op.drop_table("moderation_records")
    op.drop_index("ix_letters_parent_published", table_name="letters")
    op.drop_index("ix_letters_location_published", table_name="letters")
    op.drop_index("ix_letters_recipient_status_updated", table_name="letters")
    op.drop_index("ix_letters_author_status_updated", table_name="letters")
    op.drop_index("ix_letters_review_queue", table_name="letters")
    op.drop_index("ix_letters_public_list", table_name="letters")
    op.drop_table("letters")
