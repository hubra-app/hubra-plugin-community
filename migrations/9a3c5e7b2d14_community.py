"""community gallery, skills, ideas, honours and welcome checklist

Runs in public and in every club's schema, tracked in its own version table
(alembic_version_community). has_table() keeps it safe to run twice.

Revision ID: 9a3c5e7b2d14
Revises:
Create Date: 2026-11-05 16:00:00

"""

from alembic import op
import sqlalchemy as sa

from hubra.core.plugins.ops import has_table

revision = "9a3c5e7b2d14"
down_revision = None
branch_labels = None
depends_on = None


def _id():
    return sa.Column("id", sa.Integer(), nullable=False)


def _ts(name, nullable=True):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def _member(name="member_id", nullable=False, cascade=True):
    return (
        sa.Column(name, sa.Integer(), nullable=nullable),
        sa.ForeignKeyConstraint(
            [name], ["members.id"], ondelete="CASCADE" if cascade else "SET NULL"
        ),
    )


def _table(name, *cols, index=None):
    if not has_table(name):
        op.create_table(name, *cols, sa.PrimaryKeyConstraint("id"))
        if index:
            op.create_index(f"ix_{name}_{index}", name, [index])


def upgrade():
    _table(
        "community_albums",
        _id(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("taken_on", sa.Date(), nullable=True),
        sa.Column("members_upload", sa.Boolean(), nullable=False),
        sa.Column("cover_photo_id", sa.Integer(), nullable=True),
        *_member("created_by", nullable=True, cascade=False),
        _ts("created_at", nullable=False),
    )
    _table(
        "community_photos",
        _id(),
        sa.Column("album_id", sa.Integer(), nullable=False),
        sa.Column("file_key", sa.String(120), nullable=False),
        sa.Column("thumb_key", sa.String(120), nullable=True),
        sa.Column("content_type", sa.String(50), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("caption", sa.String(500), nullable=True),
        *_member("uploaded_by", nullable=True, cascade=False),
        _ts("created_at", nullable=False),
        sa.ForeignKeyConstraint(
            ["album_id"], ["community_albums.id"], ondelete="CASCADE"
        ),
        index="album_id",
    )
    _table(
        "community_photo_tags",
        _id(),
        sa.Column("photo_id", sa.Integer(), nullable=False),
        *_member(),
        sa.ForeignKeyConstraint(
            ["photo_id"], ["community_photos.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("photo_id", "member_id", name="uq_community_tag"),
        index="member_id",
    )
    _table(
        "community_photo_optouts",
        _id(),
        *_member(),
        _ts("created_at", nullable=False),
        sa.UniqueConstraint("member_id"),
    )
    _table(
        "community_skills",
        _id(),
        *_member(),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        _ts("created_at", nullable=False),
        index="member_id",
    )
    _table(
        "community_ideas",
        _id(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        *_member("author_id", nullable=True, cascade=False),
        sa.Column("anonymous", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        *_member("answered_by", nullable=True, cascade=False),
        _ts("answered_at"),
        sa.Column("poll_id", sa.Integer(), nullable=True),
        _ts("created_at", nullable=False),
    )
    _table(
        "community_idea_votes",
        _id(),
        sa.Column("idea_id", sa.Integer(), nullable=False),
        *_member(),
        sa.ForeignKeyConstraint(
            ["idea_id"], ["community_ideas.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("idea_id", "member_id", name="uq_community_vote"),
    )
    _table(
        "community_honours",
        _id(),
        *_member(),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("awarded_on", sa.Date(), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        _ts("created_at", nullable=False),
    )
    _table(
        "community_jubilee_notices",
        _id(),
        *_member(),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("on_date", sa.Date(), nullable=False),
        sa.UniqueConstraint("member_id", "kind", "on_date", name="uq_community_notice"),
    )
    _table(
        "community_welcome_steps",
        _id(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("link", sa.String(500), nullable=True),
        sa.Column("auto", sa.String(10), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
    )
    _table(
        "community_welcome_done",
        _id(),
        sa.Column("step_id", sa.Integer(), nullable=False),
        *_member(),
        _ts("done_at", nullable=False),
        sa.ForeignKeyConstraint(
            ["step_id"], ["community_welcome_steps.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("step_id", "member_id", name="uq_community_welcome_done"),
    )


def downgrade():
    for table in (
        "community_welcome_done",
        "community_welcome_steps",
        "community_jubilee_notices",
        "community_honours",
        "community_idea_votes",
        "community_ideas",
        "community_skills",
        "community_photo_optouts",
        "community_photo_tags",
        "community_photos",
        "community_albums",
    ):
        if has_table(table):
            op.drop_table(table)
