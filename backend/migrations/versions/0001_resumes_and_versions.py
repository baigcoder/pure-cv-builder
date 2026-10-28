"""Saved resumes and version history.

Revision ID: 0001
Revises:
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

JSONType = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "resumes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("theme", sa.String(64), nullable=False),
        sa.Column("cv_data", JSONType, nullable=False),
        sa.Column("design_settings", JSONType, nullable=False),
        sa.Column("cover_letter", JSONType, nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_resumes_owner_updated", "resumes", ["owner_id", "updated_at"])

    op.create_table(
        "resume_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "resume_id",
            sa.String(36),
            sa.ForeignKey("resumes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("theme", sa.String(64), nullable=False),
        sa.Column("cv_data", JSONType, nullable=False),
        sa.Column("design_settings", JSONType, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("resume_id", "version", name="uq_resume_versions_resume_version"),
    )
    op.create_index("ix_resume_versions_resume_id", "resume_versions", ["resume_id"])

    if op.get_bind().dialect.name == "postgresql":
        # Supabase exposes the public schema through its REST API. Enabling RLS
        # with no policies blocks anon/authenticated access; only the backend's
        # database role (the table owner) can read or write these rows.
        op.execute("ALTER TABLE resumes ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE resume_versions ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_resume_versions_resume_id", table_name="resume_versions")
    op.drop_table("resume_versions")
    op.drop_index("ix_resumes_owner_updated", table_name="resumes")
    op.drop_table("resumes")
