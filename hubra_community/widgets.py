"""Dashboard widgets of Community (docs/dashboards.md in hubra-app/hubra).

community.ideas     list  the ideas with the most votes (open or planned)
community.jubilees  list  membership jubilees and round birthdays ahead

They read as the viewing member.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select

from hubra.core.extensions import db

from . import services
from .models import CommunityIdea, CommunityIdeaVote


def _german(member) -> bool:
    return (getattr(member, "language", None) or "de").lower().startswith("de")


def _int(config: dict, key: str, default: int, high: int) -> int:
    try:
        return max(1, min(int(config.get(key) or default), high))
    except (TypeError, ValueError):
        return default


def ideas(ctx, config: dict) -> dict:
    """Open and planned ideas, most votes first."""
    votes = (
        select(CommunityIdeaVote.idea_id, func.count().label("n"))
        .group_by(CommunityIdeaVote.idea_id)
        .subquery()
    )
    query = (
        select(CommunityIdea, func.coalesce(votes.c.n, 0))
        .outerjoin(votes, votes.c.idea_id == CommunityIdea.id)
        .where(CommunityIdea.status.in_(("open", "planned")))
        .order_by(func.coalesce(votes.c.n, 0).desc(), CommunityIdea.created_at.desc())
    )
    total = db.session.scalar(
        select(func.count()).where(CommunityIdea.status.in_(("open", "planned")))
    )
    german = _german(ctx.actor)
    items = []
    for idea, n in db.session.execute(query.limit(_int(config, "count", 5, 20))).all():
        word = ("Stimme", "Stimmen") if german else ("vote", "votes")
        sub = f"{n} {word[n != 1]}"
        if idea.status == "planned":
            sub += " · " + ("geplant" if german else "planned")
        items.append({"label": idea.title, "sub": sub, "path": "/app/community/ideas"})
    return {"items": items, "total": total or 0}


def jubilees(ctx, config: dict) -> dict:
    """Jubilees and round birthdays in the next ``days`` days."""
    today = date.today()
    found = services.jubilees(today, today + timedelta(days=_int(config, "days", 30, 366)))
    german = _german(ctx.actor)
    items = []
    for j in found[: _int(config, "count", 5, 20)]:
        when = date.fromisoformat(j["date"])
        if j["kind"] == "birthday":
            what = f"{j['years']}. Geburtstag" if german else f"{j['years']}th birthday"
        else:
            what = (
                f"{j['years']} Jahre Mitglied" if german else f"{j['years']} years a member"
            )
        items.append(
            {"label": j["name"], "sub": f"{when:%d.%m.} · {what}", "path": "/app/community/honours"}
        )
    return {"items": items, "total": len(found)}
