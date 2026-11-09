"""Community API: /api/v1/app/community.

GET    /options                       what the caller may do, own photo consent
PUT    /consent                       {allowed}: "no" removes the caller's tags

GET    /albums                        albums with photo count and cover
POST   /albums                        {title, description?, takenOn?, membersUpload?}
GET    /albums/<id>                   with photos and who is tagged
PATCH  /albums/<id>                   same fields, coverPhotoId
DELETE /albums/<id>                   and its photos
POST   /albums/<id>/photos            multipart: photos (up to 20)
GET    /photos/<id>/file?size=thumb   the image
PATCH  /photos/<id>                   {caption?, tags?: [memberId]}
DELETE /photos/<id>                   the uploader or a gallery manager
DELETE /photos/<id>/tags/me           untag oneself

GET    /ideas?status=                 the idea box, most votes first
POST   /ideas                         {title, body?, anonymous?}
DELETE /ideas/<id>                    own before it is answered, or the board
POST   /ideas/<id>/vote               toggles the caller's vote
POST   /ideas/<id>/answer             {status, answer?}
POST   /ideas/<id>/poll               {question?, closesAt?}: a poll in Umfragen

GET    /honours                       members of the honorary tier (everyone);
                                      the board also gets tiers and old honours
PUT    /honours/tier                  {tierId|null}: which tier is honorary
POST   /honours/legacy                {action: move|discard} honours from 1.0
GET    /jubilees?days=60              coming membership jubilees and round birthdays

GET    /welcome                       the caller's checklist
PUT    /welcome/<step>                {done}
GET    /welcome/steps                 every step (board)
POST   /welcome/steps                 {title, description?, link?, auto?}
PATCH  /welcome/steps/<id>
DELETE /welcome/steps/<id>
GET    /welcome/progress?days=180     newer members and what they still need
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, Response, jsonify, request
from sqlalchemy import func, select

from hubra.core import files as store
from hubra.core.auth.helpers import get_current_member
from hubra.core.errors import api_error
from hubra.core.extensions import db
from hubra.core.models.member import Member, MembershipTier
from hubra.core.permissions import permission_required, require_member
from hubra.core.utils import log_audit

from . import images, services
from .body import Invalid, _body, _bool, _can, _date, _get, _int, _iso, _names, _text
from .models import (
    CommunityAlbum,
    CommunityHonour,
    CommunityIdea,
    CommunityIdeaVote,
    CommunityPhoto,
    CommunityPhotoOptout,
    CommunityPhotoTag,
    CommunityWelcomeDone,
    CommunityWelcomeStep,
)
from .notify import notify

community_bp = Blueprint("community_bp", __name__)

GALLERIES = "community.galleries.update"
IDEAS = "community.ideas.update"
WELCOME = "community.welcome.update"
HONOURS = "community.honours.update"
TIER_SETTING = "honour_tier_id"
MAX_PHOTOS = 20
STATUSES = ("open", "planned", "done", "declined")
AUTOS = ("fee", "photo")


@community_bp.errorhandler(Invalid)
def _invalid(exc: Invalid):
    return api_error("VALIDATION_ERROR", exc.message, 400)


def _ids(value, key: str) -> list[int]:
    if not isinstance(value, list) or len(value) > 200:
        raise Invalid(f"{key} must be a list of ids")
    out = []
    for v in value:
        if isinstance(v, bool) or not isinstance(v, int) or v < 1:
            raise Invalid(f"{key} must be a list of ids")
        out.append(v)
    return out


# ── Options and consent ──────────────────────────────────────────────────────


def _opted_out(member_ids) -> set[int]:
    ids = list(set(member_ids))
    if not ids:
        return set()
    return set(
        db.session.scalars(
            select(CommunityPhotoOptout.member_id).where(
                CommunityPhotoOptout.member_id.in_(ids)
            )
        )
    )


@community_bp.get("/options")
@require_member
def options():
    member = get_current_member()
    return jsonify(
        {
            "memberId": member.id,
            "can": {
                "galleries": _can(member, GALLERIES),
                "ideas": _can(member, IDEAS),
                "welcome": _can(member, WELCOME),
                "honours": _can(member, HONOURS),
            },
            "photosOfMe": member.id not in _opted_out([member.id]),
        }
    )


@community_bp.put("/consent")
@require_member
def consent():
    member = get_current_member()
    allowed = _bool(_body(), "allowed")
    row = db.session.scalar(
        select(CommunityPhotoOptout).where(CommunityPhotoOptout.member_id == member.id)
    )
    if allowed and row is not None:
        db.session.delete(row)
    elif not allowed:
        if row is None:
            db.session.add(CommunityPhotoOptout(member_id=member.id))
        for tag in db.session.scalars(
            select(CommunityPhotoTag).where(CommunityPhotoTag.member_id == member.id)
        ):
            db.session.delete(tag)
    log_audit(member.id, "community.consent", "Member", member.id, str(allowed))
    db.session.commit()
    return jsonify({"photosOfMe": allowed})


# ── Gallery ──────────────────────────────────────────────────────────────────


def _album(a: CommunityAlbum, count: int, member) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "description": a.description,
        "takenOn": _iso(a.taken_on),
        "membersUpload": a.members_upload,
        "coverPhotoId": a.cover_photo_id,
        "photos": count,
        "canUpload": a.members_upload or _can(member, GALLERIES),
        "canEdit": _can(member, GALLERIES) or a.created_by == member.id,
        "createdAt": _iso(a.created_at),
    }


def _photo(p: CommunityPhoto, tags: dict, names: dict, member, manage: bool) -> dict:
    return {
        "id": p.id,
        "albumId": p.album_id,
        "caption": p.caption,
        "width": p.width,
        "height": p.height,
        "uploadedBy": names.get(p.uploaded_by or 0),
        "mine": p.uploaded_by == member.id,
        "canEdit": manage or p.uploaded_by == member.id,
        "tags": [
            {"memberId": m, "name": names.get(m, "?")} for m in tags.get(p.id, [])
        ],
        "createdAt": _iso(p.created_at),
    }


def _covers(albums: list[CommunityAlbum]) -> dict[int, int]:
    """The cover of each album: the chosen one, else its first photo."""
    out = {a.id: a.cover_photo_id for a in albums if a.cover_photo_id}
    missing = [a.id for a in albums if a.id not in out]
    if missing:
        for album_id, photo_id in db.session.execute(
            select(CommunityPhoto.album_id, func.min(CommunityPhoto.id))
            .where(CommunityPhoto.album_id.in_(missing))
            .group_by(CommunityPhoto.album_id)
        ):
            out[album_id] = photo_id
    return out


@community_bp.get("/albums")
@require_member
def list_albums():
    member = get_current_member()
    albums = list(
        db.session.scalars(
            select(CommunityAlbum).order_by(
                func.coalesce(
                    CommunityAlbum.taken_on, func.date(CommunityAlbum.created_at)
                ).desc(),
                CommunityAlbum.id.desc(),
            )
        )
    )
    counts = dict(
        db.session.execute(
            select(CommunityPhoto.album_id, func.count()).group_by(
                CommunityPhoto.album_id
            )
        ).all()
    )
    covers = _covers(albums)
    out = []
    for a in albums:
        row = _album(a, counts.get(a.id, 0), member)
        row["coverPhotoId"] = covers.get(a.id)
        out.append(row)
    return jsonify(out)


def _album_fields(a: CommunityAlbum, data: dict, creating: bool) -> None:
    if creating or "title" in data:
        a.title = _text(data, "title", 200, required=True)
    if creating or "description" in data:
        a.description = _text(data, "description", 5000)
    if creating or "takenOn" in data:
        a.taken_on = _date(data, "takenOn")
    if creating or "membersUpload" in data:
        a.members_upload = (
            _bool(data, "membersUpload") if "membersUpload" in data else True
        )
    if "coverPhotoId" in data:
        cover = _int(data, "coverPhotoId", 1, 2**31 - 1)
        if cover is not None:
            p = db.session.get(CommunityPhoto, cover)
            if p is None or p.album_id != a.id:
                raise Invalid("coverPhotoId: not a photo of this album")
        a.cover_photo_id = cover


@community_bp.post("/albums")
@permission_required("galleries", "update", "Create albums and manage every photo")
def create_album():
    member = get_current_member()
    a = CommunityAlbum(created_by=member.id)
    _album_fields(a, _body(), creating=True)
    db.session.add(a)
    db.session.flush()
    log_audit(member.id, "community.album.create", "CommunityAlbum", a.id, a.title)
    db.session.commit()
    return jsonify(_album(a, 0, member)), 201


@community_bp.get("/albums/<int:album_id>")
@require_member
def get_album(album_id: int):
    member = get_current_member()
    a, err = _get(CommunityAlbum, album_id)
    if err:
        return err
    photos = list(
        db.session.scalars(
            select(CommunityPhoto)
            .where(CommunityPhoto.album_id == a.id)
            .order_by(CommunityPhoto.created_at, CommunityPhoto.id)
        )
    )
    tags: dict[int, list[int]] = {}
    for t in db.session.scalars(
        select(CommunityPhotoTag).where(
            CommunityPhotoTag.photo_id.in_([p.id for p in photos] or [0])
        )
    ):
        tags.setdefault(t.photo_id, []).append(t.member_id)
    names = _names(
        {p.uploaded_by for p in photos} | {m for ms in tags.values() for m in ms}
    )
    manage = _can(member, GALLERIES)
    out = _album(a, len(photos), member)
    out["coverPhotoId"] = _covers([a]).get(a.id)
    out["items"] = [_photo(p, tags, names, member, manage) for p in photos]
    return jsonify(out)


def _album_editor(album_id: int):
    member = get_current_member()
    a, err = _get(CommunityAlbum, album_id)
    if err:
        return None, err
    if not (_can(member, GALLERIES) or a.created_by == member.id):
        return None, api_error("FORBIDDEN", "not your album", 403)
    return a, None


@community_bp.patch("/albums/<int:album_id>")
@require_member
def update_album(album_id: int):
    member = get_current_member()
    a, err = _album_editor(album_id)
    if err:
        return err
    _album_fields(a, _body(), creating=False)
    db.session.commit()
    return jsonify(_album(a, 0, member))


def _drop_photo_files(p: CommunityPhoto) -> None:
    for key in (p.file_key, p.thumb_key):
        if key:
            try:
                store.remove(key)
            except store.FileNotFound:
                pass


@community_bp.delete("/albums/<int:album_id>")
@require_member
def delete_album(album_id: int):
    member = get_current_member()
    a, err = _album_editor(album_id)
    if err:
        return err
    for p in db.session.scalars(
        select(CommunityPhoto).where(CommunityPhoto.album_id == a.id)
    ):
        _drop_photo_files(p)
    log_audit(member.id, "community.album.delete", "CommunityAlbum", a.id, a.title)
    db.session.delete(a)
    db.session.commit()
    return "", 204


@community_bp.post("/albums/<int:album_id>/photos")
@require_member
def upload(album_id: int):
    member = get_current_member()
    a, err = _get(CommunityAlbum, album_id)
    if err:
        return err
    if not (a.members_upload or _can(member, GALLERIES)):
        return api_error("FORBIDDEN", "only the board adds photos here", 403)
    uploads = request.files.getlist("photos")
    if not uploads:
        raise Invalid("photos is required")
    if len(uploads) > MAX_PHOTOS:
        raise Invalid(f"at most {MAX_PHOTOS} photos at once")
    made, failed = [], []
    for f in uploads:
        data = f.read()
        try:
            full, kind, thumb, width, height = images.process(data)
            big = store.put("community", full, kind)
            small = store.put("community", thumb, kind)
        except images.BadImage:
            # Fixed texts: exception messages don't go back to the browser.
            failed.append(
                {
                    "name": (f.filename or "")[:120],
                    "reason": "not a JPEG, PNG, WebP or GIF photo",
                }
            )
            continue
        except store.FileTooLarge:
            failed.append(
                {
                    "name": (f.filename or "")[:120],
                    "reason": "larger than the club's file limit",
                }
            )
            continue
        except store.FileStoreError:
            db.session.rollback()
            return api_error("FILE_STORE", "the file store is not set up", 503)
        p = CommunityPhoto(
            album_id=a.id,
            file_key=big.key,
            thumb_key=small.key,
            content_type=kind,
            width=width,
            height=height,
            uploaded_by=member.id,
        )
        db.session.add(p)
        made.append(p)
    db.session.flush()
    if made:
        log_audit(
            member.id, "community.photos.add", "CommunityAlbum", a.id, f"{len(made)}"
        )
    db.session.commit()
    names = _names([member.id])
    return (
        jsonify(
            {
                "added": [_photo(p, {}, names, member, True) for p in made],
                "failed": failed,
            }
        ),
        201 if made else 400,
    )


@community_bp.get("/photos/<int:photo_id>/file")
@require_member
def photo_file(photo_id: int):
    p, err = _get(CommunityPhoto, photo_id)
    if err:
        return err
    key = (
        p.thumb_key
        if request.args.get("size") == "thumb" and p.thumb_key
        else p.file_key
    )
    try:
        data = store.read(key)
    except store.FileNotFound:
        return api_error("NOT_FOUND", "the photo file is gone", 404)
    resp = Response(data, mimetype=p.content_type)
    resp.headers["Cache-Control"] = "private, max-age=86400"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


def _photo_editor(photo_id: int):
    member = get_current_member()
    p, err = _get(CommunityPhoto, photo_id)
    if err:
        return None, err
    if not (_can(member, GALLERIES) or p.uploaded_by == member.id):
        return None, api_error("FORBIDDEN", "not your photo", 403)
    return p, None


@community_bp.patch("/photos/<int:photo_id>")
@require_member
def update_photo(photo_id: int):
    p, err = _photo_editor(photo_id)
    if err:
        return err
    data = _body()
    if "caption" in data:
        p.caption = _text(data, "caption", 500)
    if "tags" in data:
        wanted = set(_ids(data.get("tags"), "tags"))
        refused = _opted_out(wanted)
        if refused:
            return api_error(
                "NO_PHOTO_CONSENT",
                "some of them don't want to be tagged in photos",
                409,
            )
        found = set(
            db.session.scalars(
                select(Member.id).where(Member.id.in_(list(wanted) or [0]))
            )
        )
        if found != wanted:
            raise Invalid("tags: no such member")
        existing = {
            t.member_id: t
            for t in db.session.scalars(
                select(CommunityPhotoTag).where(CommunityPhotoTag.photo_id == p.id)
            )
        }
        for mid, t in existing.items():
            if mid not in wanted:
                db.session.delete(t)
        for mid in wanted - set(existing):
            db.session.add(CommunityPhotoTag(photo_id=p.id, member_id=mid))
    db.session.commit()
    return get_album(p.album_id)


@community_bp.delete("/photos/<int:photo_id>")
@require_member
def delete_photo(photo_id: int):
    member = get_current_member()
    p, err = _photo_editor(photo_id)
    if err:
        return err
    a = db.session.get(CommunityAlbum, p.album_id)
    if a is not None and a.cover_photo_id == p.id:
        a.cover_photo_id = None
    _drop_photo_files(p)
    log_audit(member.id, "community.photo.delete", "CommunityPhoto", p.id, "")
    db.session.delete(p)
    db.session.commit()
    return "", 204


@community_bp.delete("/photos/<int:photo_id>/tags/me")
@require_member
def untag_me(photo_id: int):
    member = get_current_member()
    tag = db.session.scalar(
        select(CommunityPhotoTag)
        .where(CommunityPhotoTag.photo_id == photo_id)
        .where(CommunityPhotoTag.member_id == member.id)
    )
    if tag is not None:
        db.session.delete(tag)
        db.session.commit()
    return "", 204


# ── Ideas ────────────────────────────────────────────────────────────────────


def _idea(
    i: CommunityIdea, votes: Counter, voted: set, names: dict, member, manage: bool
) -> dict:
    mine = i.author_id == member.id
    return {
        "id": i.id,
        "title": i.title,
        "body": i.body,
        "anonymous": i.anonymous,
        "author": None if i.anonymous else names.get(i.author_id or 0),
        "mine": mine,
        "status": i.status,
        "answer": i.answer,
        "answeredBy": names.get(i.answered_by or 0) if i.answer else None,
        "answeredAt": _iso(i.answered_at),
        "pollId": i.poll_id,
        "votes": votes.get(i.id, 0),
        "voted": i.id in voted,
        "canDelete": manage or (mine and i.answer is None),
        "createdAt": _iso(i.created_at),
    }


def _ideas_out(rows: list[CommunityIdea], member) -> list[dict]:
    ids = [i.id for i in rows]
    votes = Counter(
        dict(
            db.session.execute(
                select(CommunityIdeaVote.idea_id, func.count())
                .where(CommunityIdeaVote.idea_id.in_(ids or [0]))
                .group_by(CommunityIdeaVote.idea_id)
            ).all()
        )
    )
    voted = set(
        db.session.scalars(
            select(CommunityIdeaVote.idea_id)
            .where(CommunityIdeaVote.idea_id.in_(ids or [0]))
            .where(CommunityIdeaVote.member_id == member.id)
        )
    )
    names = _names(
        {i.author_id for i in rows if not i.anonymous} | {i.answered_by for i in rows}
    )
    manage = _can(member, IDEAS)
    return [_idea(i, votes, voted, names, member, manage) for i in rows]


@community_bp.get("/ideas")
@require_member
def list_ideas():
    member = get_current_member()
    query = select(CommunityIdea)
    status = request.args.get("status")
    if status in STATUSES:
        query = query.where(CommunityIdea.status == status)
    elif status == "active":
        query = query.where(CommunityIdea.status.in_(("open", "planned")))
    rows = list(db.session.scalars(query.limit(500)))
    out = _ideas_out(rows, member)
    out.sort(key=lambda i: (-i["votes"], i["createdAt"] or ""), reverse=False)
    return jsonify(out)


@community_bp.post("/ideas")
@require_member
def create_idea():
    member = get_current_member()
    data = _body()
    i = CommunityIdea(
        title=_text(data, "title", 200, required=True),
        body=_text(data, "body", 5000),
        anonymous=_bool(data, "anonymous"),
        author_id=member.id,
        status="open",
    )
    db.session.add(i)
    db.session.flush()
    # The author's vote counts from the start.
    db.session.add(CommunityIdeaVote(idea_id=i.id, member_id=member.id))
    db.session.commit()
    return jsonify(_ideas_out([i], member)[0]), 201


@community_bp.delete("/ideas/<int:idea_id>")
@require_member
def delete_idea(idea_id: int):
    member = get_current_member()
    i, err = _get(CommunityIdea, idea_id)
    if err:
        return err
    if not (_can(member, IDEAS) or (i.author_id == member.id and i.answer is None)):
        return api_error("FORBIDDEN", "not yours, or already answered", 403)
    log_audit(member.id, "community.idea.delete", "CommunityIdea", i.id, i.title)
    db.session.delete(i)
    db.session.commit()
    return "", 204


@community_bp.post("/ideas/<int:idea_id>/vote")
@require_member
def vote(idea_id: int):
    member = get_current_member()
    i, err = _get(CommunityIdea, idea_id)
    if err:
        return err
    row = db.session.scalar(
        select(CommunityIdeaVote)
        .where(CommunityIdeaVote.idea_id == i.id)
        .where(CommunityIdeaVote.member_id == member.id)
    )
    if row is None:
        if i.status in ("done", "declined"):
            return api_error("IDEA_CLOSED", "this idea is closed", 409)
        db.session.add(CommunityIdeaVote(idea_id=i.id, member_id=member.id))
    else:
        db.session.delete(row)
    db.session.commit()
    return jsonify(_ideas_out([i], member)[0])


@community_bp.post("/ideas/<int:idea_id>/answer")
@permission_required("ideas", "update", "Answer ideas and turn them into polls")
def answer_idea(idea_id: int):
    member = get_current_member()
    i, err = _get(CommunityIdea, idea_id)
    if err:
        return err
    data = _body()
    status = data.get("status") or i.status
    if status not in STATUSES:
        raise Invalid("status must be open, planned, done or declined")
    i.status = status
    i.answer = _text(data, "answer", 5000)
    i.answered_by = member.id if i.answer else None
    i.answered_at = datetime.now(timezone.utc) if i.answer else None
    if i.author_id and i.author_id != member.id:
        title = i.title[:120]
        notify(
            [i.author_id],
            lambda de: (
                ("Antwort auf deine Idee", title)
                if de
                else ("Your idea got an answer", title)
            ),
            "/app/community/ideas",
        )
    log_audit(member.id, "community.idea.answer", "CommunityIdea", i.id, status)
    db.session.commit()
    return jsonify(_ideas_out([i], member)[0])


@community_bp.post("/ideas/<int:idea_id>/poll")
@permission_required("ideas", "update", "Answer ideas and turn them into polls")
def idea_poll(idea_id: int):
    from hubra.core.modules import is_enabled

    member = get_current_member()
    i, err = _get(CommunityIdea, idea_id)
    if err:
        return err
    if i.poll_id:
        return api_error("POLL_EXISTS", "this idea already has a poll", 409)
    if not is_enabled("polls"):
        return api_error("POLLS_OFF", "the polls module is switched off", 409)
    from hubra.core.contracts import SYSTEM, call

    data = _body()
    question = _text(data, "question", 255) or i.title[:255]
    closes = data.get("closesAt")
    closes_at = None
    if closes:
        try:
            closes_at = datetime.fromisoformat(str(closes).replace("Z", "+00:00"))
        except ValueError:
            raise Invalid("closesAt must be a time") from None
        if closes_at.tzinfo is None:
            closes_at = closes_at.replace(tzinfo=timezone.utc)
    labels = (
        ("Dafür", "Dagegen", "Enthaltung")
        if (getattr(member, "language", None) or "de").startswith("de")
        else ("For", "Against", "Abstain")
    )
    # The route checked the member's right to turn an idea into a poll.
    poll = call(
        "polls.poll.create",
        question=question,
        closes_at=closes_at,
        auto_close=closes_at is not None,
        options=[{"label": label} for label in labels],
        actor_id=member.id,
        actor=SYSTEM,
    )
    i.poll_id = poll["id"]
    if i.status == "open":
        i.status = "planned"
    db.session.commit()
    return jsonify(_ideas_out([i], member)[0])


# ── Honours and jubilees ─────────────────────────────────────────────────────
#
# Honorary members are a membership tier like any other: the board picks
# which tier (module setting honour_tier_id) and gives members that tier in
# Members, where its fee (usually none) applies too. Honours kept before
# 1.1.0 in community_honours wait on the tab until the board moves them onto
# the tier or drops them.


def _honour_tier() -> MembershipTier | None:
    from hubra.core.modules import get_config

    tier_id = get_config("community").get(TIER_SETTING)
    if not isinstance(tier_id, int):
        return None
    return db.session.get(MembershipTier, tier_id)


def _active(query):
    return query.where(Member.status == "active").where(Member.archived_at.is_(None))


def _legacy(names: dict) -> list[dict]:
    rows = db.session.scalars(
        select(CommunityHonour).order_by(
            CommunityHonour.awarded_on.desc().nulls_last(), CommunityHonour.id
        )
    )
    return [
        {
            "id": h.id,
            "memberId": h.member_id,
            "name": names.get(h.member_id, "?"),
            "title": h.title,
            "awardedOn": _iso(h.awarded_on),
            "note": h.note,
        }
        for h in rows
    ]


@community_bp.get("/honours")
@require_member
def list_honours():
    member = get_current_member()
    tier = _honour_tier()
    members = (
        list(
            db.session.scalars(_active(select(Member).where(Member.tier_id == tier.id)))
        )
        if tier
        else []
    )
    members.sort(key=lambda m: (m.name or "").lower())
    out: dict = {
        "tier": {"id": tier.id, "name": tier.name} if tier else None,
        "members": [
            {"memberId": m.id, "name": m.name, "since": _iso(m.joined)} for m in members
        ],
    }
    if _can(member, HONOURS):
        counts = dict(
            db.session.execute(
                _active(
                    select(Member.tier_id, func.count(Member.id)).where(
                        Member.tier_id.is_not(None)
                    )
                ).group_by(Member.tier_id)
            ).all()
        )
        out["tiers"] = [
            {"id": t.id, "name": t.name, "members": counts.get(t.id, 0)}
            for t in db.session.scalars(
                select(MembershipTier).order_by(MembershipTier.name)
            )
        ]
        legacy_ids = db.session.scalars(select(CommunityHonour.member_id)).all()
        out["legacy"] = _legacy(_names(legacy_ids))
    return jsonify(out)


@community_bp.put("/honours/tier")
@permission_required("honours", "update", "Keep honorary members and see jubilees")
def set_honour_tier():
    from hubra.core.modules import get_config, set_config

    member = get_current_member()
    tier_id = _int(_body(), "tierId", 1, 2**31 - 1)
    tier = db.session.get(MembershipTier, tier_id) if tier_id else None
    if tier_id and tier is None:
        raise Invalid("tierId: no such tier")
    config = get_config("community")
    config[TIER_SETTING] = tier.id if tier else None
    set_config("community", config)
    log_audit(
        member.id,
        "community.honour.tier",
        "MembershipTier",
        tier.id if tier else None,
        tier.name if tier else "-",
    )
    db.session.commit()
    return list_honours()


@community_bp.post("/honours/legacy")
@permission_required("honours", "update", "Keep honorary members and see jubilees")
def move_legacy():
    """Moves the honours kept before 1.1.0 onto the tier, or drops them."""
    member = get_current_member()
    action = _body().get("action")
    if action not in ("move", "discard"):
        raise Invalid("action must be move or discard")
    rows = list(db.session.scalars(select(CommunityHonour)))
    if action == "move":
        tier = _honour_tier()
        if tier is None:
            raise Invalid("pick the honorary members' tier first")
        ids = {h.member_id for h in rows}
        for m in db.session.scalars(select(Member).where(Member.id.in_(ids))):
            if m.tier_id != tier.id:
                log_audit(
                    member.id,
                    "community.honour.move",
                    "Member",
                    m.id,
                    f"{m.name}: {tier.name}",
                )
                m.tier_id = tier.id
    for h in rows:
        db.session.delete(h)
    db.session.commit()
    return list_honours()


@community_bp.get("/jubilees")
@permission_required("honours", "update", "Keep honorary members and see jubilees")
def jubilees():
    days = request.args.get("days", type=int) or 60
    days = max(1, min(days, 366))
    today = date.today()
    return jsonify(services.jubilees(today, today + timedelta(days=days)))


# ── Welcome ──────────────────────────────────────────────────────────────────


def _step(s: CommunityWelcomeStep) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "description": s.description,
        "link": s.link,
        "auto": s.auto,
        "position": s.position,
        "active": s.active,
    }


@community_bp.get("/welcome")
@require_member
def my_welcome():
    member = get_current_member()
    steps = services.active_steps()
    done = services.done_for([member], steps).get(member.id, set())
    joined = member.joined
    recent = joined is None or joined >= date.today() - timedelta(
        days=services.NEW_FOR_DAYS
    )
    return jsonify(
        {
            "steps": [{**_step(s), "done": s.id in done} for s in steps],
            "show": bool(steps) and recent and len(done) < len(steps),
        }
    )


@community_bp.put("/welcome/<int:step_id>")
@require_member
def tick(step_id: int):
    member = get_current_member()
    s, err = _get(CommunityWelcomeStep, step_id)
    if err:
        return err
    if s.auto:
        raise Invalid("this step ticks itself")
    row = db.session.scalar(
        select(CommunityWelcomeDone)
        .where(CommunityWelcomeDone.step_id == s.id)
        .where(CommunityWelcomeDone.member_id == member.id)
    )
    if _bool(_body(), "done"):
        if row is None:
            db.session.add(CommunityWelcomeDone(step_id=s.id, member_id=member.id))
    elif row is not None:
        db.session.delete(row)
    db.session.commit()
    return my_welcome()


@community_bp.get("/welcome/steps")
@permission_required("welcome", "update", "Set the welcome steps and see who is stuck")
def list_steps():
    rows = db.session.scalars(
        select(CommunityWelcomeStep).order_by(
            CommunityWelcomeStep.position, CommunityWelcomeStep.id
        )
    )
    return jsonify([_step(s) for s in rows])


def _step_fields(s: CommunityWelcomeStep, data: dict, creating: bool) -> None:
    if creating or "title" in data:
        s.title = _text(data, "title", 200, required=True)
    if creating or "description" in data:
        s.description = _text(data, "description", 1000)
    if creating or "link" in data:
        link = _text(data, "link", 500)
        if link and not (link.startswith("/") or link.startswith("https://")):
            raise Invalid("link must start with / or https://")
        s.link = link
    if creating or "auto" in data:
        auto = data.get("auto") or None
        if auto is not None and auto not in AUTOS:
            raise Invalid("auto must be fee or photo")
        s.auto = auto
    if "position" in data:
        s.position = _int(data, "position", 0, 10000, 0)
    if "active" in data:
        s.active = _bool(data, "active")


@community_bp.post("/welcome/steps")
@permission_required("welcome", "update", "Set the welcome steps and see who is stuck")
def create_step():
    last = db.session.scalar(select(func.max(CommunityWelcomeStep.position))) or 0
    s = CommunityWelcomeStep(position=last + 1, active=True)
    _step_fields(s, _body(), creating=True)
    db.session.add(s)
    db.session.commit()
    return jsonify(_step(s)), 201


@community_bp.patch("/welcome/steps/<int:step_id>")
@permission_required("welcome", "update", "Set the welcome steps and see who is stuck")
def update_step(step_id: int):
    s, err = _get(CommunityWelcomeStep, step_id)
    if err:
        return err
    _step_fields(s, _body(), creating=False)
    db.session.commit()
    return jsonify(_step(s))


@community_bp.delete("/welcome/steps/<int:step_id>")
@permission_required("welcome", "update", "Set the welcome steps and see who is stuck")
def delete_step(step_id: int):
    s, err = _get(CommunityWelcomeStep, step_id)
    if err:
        return err
    db.session.delete(s)
    db.session.commit()
    return "", 204


@community_bp.get("/welcome/progress")
@permission_required("welcome", "update", "Set the welcome steps and see who is stuck")
def progress():
    days = request.args.get("days", type=int) or services.NEW_FOR_DAYS
    days = max(7, min(days, 730))
    since = date.today() - timedelta(days=days)
    members = list(
        db.session.scalars(
            select(Member)
            .where(Member.status == "active")
            .where(Member.archived_at.is_(None))
            .where(Member.joined >= since)
            .order_by(Member.joined.desc())
        )
    )
    steps = services.active_steps()
    done = services.done_for(members, steps)
    out = []
    for m in members:
        mine = done.get(m.id, set())
        out.append(
            {
                "memberId": m.id,
                "name": m.name,
                "joined": _iso(m.joined),
                "done": len(mine),
                "total": len(steps),
                "missing": [s.title for s in steps if s.id not in mine],
            }
        )
    out.sort(key=lambda r: (r["done"] - r["total"], r["joined"] or ""))
    return jsonify({"steps": [_step(s) for s in steps], "members": out})
