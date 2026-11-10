"""What Community offers others (Hubra docs/contracts.md).

Photo albums are moving into the Documents plugin, where an album is a
folder with access per role and group like any other. Documents reads the
albums through ``community.albums.export`` and takes them over (copying the
photos in Hubra's file store); it never reads this plugin's tables. While
Documents is on, the Gallery tab here points there instead.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field
from sqlalchemy import select

from hubra.core.extensions import db

from .models import CommunityAlbum, CommunityPhoto, CommunityPhotoOptout, CommunityPhotoTag


class AlbumsIn(BaseModel):
    # Albums with an id above this, the oldest first (for paging).
    after_id: int = 0
    limit: int = Field(default=20, ge=1, le=100)


class ExportedPhoto(BaseModel):
    id: int
    # Keys in Hubra's file store; read them with hubra.core.files.
    file_key: str
    thumb_key: str | None = None
    content_type: str
    width: int | None = None
    height: int | None = None
    caption: str | None = None
    uploaded_by: int | None = None
    created_at: datetime
    tags: list[int] = []


class ExportedAlbum(BaseModel):
    id: int
    title: str
    description: str | None = None
    taken_on: date | None = None
    members_upload: bool = True
    cover_photo_id: int | None = None
    created_by: int | None = None
    created_at: datetime
    photos: list[ExportedPhoto] = []


class OptoutsIn(BaseModel):
    pass


class Optout(BaseModel):
    member_id: int


def export_albums(ctx, data: AlbumsIn) -> list[ExportedAlbum]:
    albums = db.session.scalars(
        select(CommunityAlbum)
        .where(CommunityAlbum.id > data.after_id)
        .order_by(CommunityAlbum.id)
        .limit(data.limit)
    ).all()
    ids = [a.id for a in albums] or [0]
    photos = db.session.scalars(
        select(CommunityPhoto)
        .where(CommunityPhoto.album_id.in_(ids))
        .order_by(CommunityPhoto.created_at, CommunityPhoto.id)
    ).all()
    tags: dict[int, list[int]] = {}
    for t in db.session.scalars(
        select(CommunityPhotoTag).where(
            CommunityPhotoTag.photo_id.in_([p.id for p in photos] or [0])
        )
    ):
        tags.setdefault(t.photo_id, []).append(t.member_id)
    by_album: dict[int, list[ExportedPhoto]] = {}
    for p in photos:
        by_album.setdefault(p.album_id, []).append(
            ExportedPhoto(
                id=p.id,
                file_key=p.file_key,
                thumb_key=p.thumb_key,
                content_type=p.content_type,
                width=p.width,
                height=p.height,
                caption=p.caption,
                uploaded_by=p.uploaded_by,
                created_at=p.created_at,
                tags=tags.get(p.id, []),
            )
        )
    return [
        ExportedAlbum(
            id=a.id,
            title=a.title,
            description=a.description,
            taken_on=a.taken_on,
            members_upload=a.members_upload,
            cover_photo_id=a.cover_photo_id,
            created_by=a.created_by,
            created_at=a.created_at,
            photos=by_album.get(a.id, []),
        )
        for a in albums
    ]


def export_optouts(ctx, data: OptoutsIn) -> list[Optout]:
    """Members who don't want to be tagged in photos."""
    return [
        Optout(member_id=m) for m in db.session.scalars(select(CommunityPhotoOptout.member_id))
    ]
