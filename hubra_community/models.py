"""The Community tables (one copy per club schema)."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from hubra.core.extensions import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _member(nullable: bool = False, cascade: bool = True) -> ForeignKey:
    return ForeignKey("members.id", ondelete="CASCADE" if cascade else "SET NULL")


# ── Gallery ──────────────────────────────────────────────────────────────────


class CommunityAlbum(db.Model):
    __tablename__ = "community_albums"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    taken_on: Mapped[date | None] = mapped_column(Date)
    # Every member may add photos, not only those who manage galleries.
    members_upload: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    cover_photo_id: Mapped[int | None] = mapped_column(Integer)
    created_by: Mapped[int | None] = mapped_column(_member(cascade=False))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


class CommunityPhoto(db.Model):
    __tablename__ = "community_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    album_id: Mapped[int] = mapped_column(
        ForeignKey("community_albums.id", ondelete="CASCADE"), nullable=False
    )
    file_key: Mapped[str] = mapped_column(String(120), nullable=False)
    thumb_key: Mapped[str | None] = mapped_column(String(120))
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    caption: Mapped[str | None] = mapped_column(String(500))
    uploaded_by: Mapped[int | None] = mapped_column(_member(cascade=False))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


class CommunityPhotoTag(db.Model):
    __tablename__ = "community_photo_tags"
    __table_args__ = (
        UniqueConstraint("photo_id", "member_id", name="uq_community_tag"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    photo_id: Mapped[int] = mapped_column(
        ForeignKey("community_photos.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[int] = mapped_column(_member(), nullable=False)


class CommunityPhotoOptout(db.Model):
    """A member who doesn't want to be tagged in photos."""

    __tablename__ = "community_photo_optouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(_member(), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


# ── Skills ───────────────────────────────────────────────────────────────────


class CommunitySkill(db.Model):
    """Something a member can do (skill) or lend (lend)."""

    __tablename__ = "community_skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(_member(), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


# ── Ideas ────────────────────────────────────────────────────────────────────


class CommunityIdea(db.Model):
    """Status: open, planned, done, declined."""

    __tablename__ = "community_ideas"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    # Kept for the author's own view and for abuse; never shown when anonymous.
    author_id: Mapped[int | None] = mapped_column(_member(cascade=False))
    anonymous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="open", nullable=False)
    answer: Mapped[str | None] = mapped_column(Text)
    answered_by: Mapped[int | None] = mapped_column(_member(cascade=False))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    poll_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


class CommunityIdeaVote(db.Model):
    __tablename__ = "community_idea_votes"
    __table_args__ = (
        UniqueConstraint("idea_id", "member_id", name="uq_community_vote"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    idea_id: Mapped[int] = mapped_column(
        ForeignKey("community_ideas.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[int] = mapped_column(_member(), nullable=False)


# ── Honours and jubilees ─────────────────────────────────────────────────────


class CommunityHonour(db.Model):
    """An honour kept before 1.1.0 (Ehrenmitglied, Freimitglied …).

    Honorary members are a membership tier now. Old rows stay until the
    board moves them onto that tier or drops them on the Honours tab.
    """

    __tablename__ = "community_honours"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(_member(), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    awarded_on: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


class CommunityJubileeNotice(db.Model):
    """That the board was told about a jubilee, so it is told once."""

    __tablename__ = "community_jubilee_notices"
    __table_args__ = (
        UniqueConstraint("member_id", "kind", "on_date", name="uq_community_notice"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(_member(), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    on_date: Mapped[date] = mapped_column(Date, nullable=False)


# ── Welcome ──────────────────────────────────────────────────────────────────


class CommunityWelcomeStep(db.Model):
    """A step for new members. ``auto`` ticks it by itself: fee (a paid
    membership invoice) or photo (a profile picture)."""

    __tablename__ = "community_welcome_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))
    link: Mapped[str | None] = mapped_column(String(500))
    auto: Mapped[str | None] = mapped_column(String(10))
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CommunityWelcomeDone(db.Model):
    __tablename__ = "community_welcome_done"
    __table_args__ = (
        UniqueConstraint("step_id", "member_id", name="uq_community_welcome_done"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    step_id: Mapped[int] = mapped_column(
        ForeignKey("community_welcome_steps.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[int] = mapped_column(_member(), nullable=False)
    done_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
