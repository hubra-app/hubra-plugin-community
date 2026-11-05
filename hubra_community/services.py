"""Jubilees and the welcome checklist's automatic steps."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select

from hubra.core.extensions import db
from hubra.core.models.member import Member

from .models import CommunityJubileeNotice, CommunityWelcomeDone, CommunityWelcomeStep
from .notify import notify

# Membership years worth a word from the board, and round birthdays.
MEMBERSHIP_YEARS = (10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75)
BIRTHDAYS = (50, 60, 70, 75, 80, 85, 90, 95, 100)
NOTICE_AHEAD = timedelta(days=14)
# How long someone counts as new for the welcome checklist.
NEW_FOR_DAYS = 180
HONOURS = "community.honours.update"


def _on(day: date, year: int) -> date:
    try:
        return day.replace(year=year)
    except ValueError:  # 29 February
        return date(year, 3, 1)


def jubilees(start: date, end: date) -> list[dict]:
    """Membership jubilees and round birthdays from *start* to *end*."""
    out = []
    members = db.session.scalars(
        select(Member)
        .where(Member.status == "active")
        .where(Member.archived_at.is_(None))
    )
    for m in members:
        for kind, base, marks in (
            ("member", m.joined, MEMBERSHIP_YEARS),
            ("birthday", m.birthday, BIRTHDAYS),
        ):
            if not base:
                continue
            for year in range(start.year, end.year + 1):
                when = _on(base, year)
                n = year - base.year
                if start <= when <= end and n in marks:
                    out.append(
                        {
                            "memberId": m.id,
                            "name": m.name,
                            "kind": kind,
                            "years": n,
                            "date": when.isoformat(),
                        }
                    )
    out.sort(key=lambda j: (j["date"], j["name"].lower()))
    return out


def _board() -> list[int]:
    from hubra.core.permissions import member_has_permission

    return [
        m.id
        for m in db.session.scalars(
            select(Member)
            .where(Member.status == "active")
            .where(Member.archived_at.is_(None))
        )
        if member_has_permission(m, HONOURS)
    ]


def notify_jubilees(today: date) -> int:
    """Tells the board about jubilees two weeks ahead, each once."""
    due = jubilees(today, today + NOTICE_AHEAD)
    fresh = []
    for j in due:
        on = date.fromisoformat(j["date"])
        seen = db.session.scalar(
            select(CommunityJubileeNotice.id)
            .where(CommunityJubileeNotice.member_id == j["memberId"])
            .where(CommunityJubileeNotice.kind == j["kind"])
            .where(CommunityJubileeNotice.on_date == on)
        )
        if seen is None:
            db.session.add(
                CommunityJubileeNotice(
                    member_id=j["memberId"], kind=j["kind"], on_date=on
                )
            )
            fresh.append(j)
    if not fresh:
        return 0
    board = _board()
    sent = 0
    for j in fresh:
        day = date.fromisoformat(j["date"]).strftime("%d.%m.")
        if j["kind"] == "member":
            texts = lambda de, j=j, day=day: (  # noqa: E731
                ("Vereinsjubiläum", f"{j['name']}: {j['years']} Jahre dabei am {day}")
                if de
                else ("Membership jubilee", f"{j['name']}: {j['years']} years on {day}")
            )
        else:
            texts = lambda de, j=j, day=day: (  # noqa: E731
                ("Runder Geburtstag", f"{j['name']} wird {j['years']} am {day}")
                if de
                else ("Round birthday", f"{j['name']} turns {j['years']} on {day}")
            )
        sent += notify(board, texts, "/app/community/honours")
    return sent


# ── Welcome ──────────────────────────────────────────────────────────────────


def active_steps() -> list[CommunityWelcomeStep]:
    return list(
        db.session.scalars(
            select(CommunityWelcomeStep)
            .where(CommunityWelcomeStep.active.is_(True))
            .order_by(CommunityWelcomeStep.position, CommunityWelcomeStep.id)
        )
    )


def _fee_paid(member_ids: list[int]) -> set[int]:
    from hubra.core.models.finance import Invoice

    if not member_ids:
        return set()
    return set(
        db.session.scalars(
            select(Invoice.member_id)
            .where(Invoice.member_id.in_(member_ids))
            .where(Invoice.purpose == "membership")
            .where(Invoice.status == "Paid")
        )
    )


def done_for(members: list, steps: list[CommunityWelcomeStep]) -> dict[int, set[int]]:
    """The steps each member has done, ticked or automatic."""
    ids = [m.id for m in members]
    out: dict[int, set[int]] = {mid: set() for mid in ids}
    if not ids or not steps:
        return out
    for row in db.session.scalars(
        select(CommunityWelcomeDone)
        .where(CommunityWelcomeDone.member_id.in_(ids))
        .where(CommunityWelcomeDone.step_id.in_([s.id for s in steps]))
    ):
        out[row.member_id].add(row.step_id)
    fee_steps = [s.id for s in steps if s.auto == "fee"]
    photo_steps = [s.id for s in steps if s.auto == "photo"]
    if fee_steps:
        for mid in _fee_paid(ids):
            out[mid].update(fee_steps)
    if photo_steps:
        for m in members:
            if m.avatar:
                out[m.id].update(photo_steps)
    return out
