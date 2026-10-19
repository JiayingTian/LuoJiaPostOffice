"""create metadata tables

Revision ID: d64158b30f7a
Revises: aac2f3b3d76f
Create Date: 2026-10-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = "d64158b30f7a"
down_revision: Union[str, Sequence[str], None] = "aac2f3b3d76f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "locations",
        sa.Column("id", mysql.CHAR(length=30), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("updated_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_locations_slug"),
    )
    op.create_table(
        "patterns",
        sa.Column("id", mysql.CHAR(length=30), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("slug", sa.String(length=60), nullable=False),
        sa.Column("preview_url", sa.String(length=500), nullable=False),
        sa.Column("asset_url", sa.String(length=500), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("updated_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_patterns_slug"),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO patterns (
                id,
                name,
                slug,
                preview_url,
                asset_url,
                is_enabled,
                sort_order,
                created_at,
                updated_at
            ) VALUES (
                'pat_00000000000000000000000001',
                '白色信纸',
                'white',
                '/pictures/material/letter-paper/white.png',
                '/pictures/material/letter-paper/white.png',
                1,
                10,
                UTC_TIMESTAMP(6),
                UTC_TIMESTAMP(6)
            )
            """
        )
    )


def downgrade() -> None:
    op.drop_table("patterns")
    op.drop_table("locations")
