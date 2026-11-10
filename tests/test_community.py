"""The Community plugin: gallery with photo consent, the idea box,
honorary members and jubilees, and the welcome checklist.

Runs with Hubra's fixtures once the plugin is in plugins/community of a
Hubra checkout (see README.md).
"""

from __future__ import annotations

import io
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from tests.helpers import set_modules
from tests.settings.test_settings_kv import _login, _make_role_and_member

BASE = "/api/v1/app/community"


def _png(width=40, height=30, color=(200, 30, 30)) -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (width, height), color).save(out, "PNG")
    return out.getvalue()


@pytest.fixture
def club(client, app, db, seeded_db, tmp_path):
    """Gabi runs the gallery, Ida the idea box, Hana honours, Wim the welcome
    steps; Max and Lea are members."""
    set_modules(True, "community")
    app.config["FILES_DIR"] = str(tmp_path)
    app.test_cli_runner().invoke(args=["sync-permissions"])
    tier = seeded_db["tier"]
    people = {
        "gabi": ["community.galleries.update"],
        "ida": ["community.ideas.update"],
        "hana": ["community.honours.update"],
        "wim": ["community.welcome.update"],
        "max": [],
        "lea": [],
    }
    out = {}
    for name, keys in people.items():
        m = _make_role_and_member(
            db, tier, name=name.capitalize(), permission_keys=keys
        )
        out[name] = m.id
    return out


def _upload(client, album_id, *blobs):
    form = {
        "photos": [
            (io.BytesIO(b), f"p{i}.png", "image/png") for i, b in enumerate(blobs)
        ]
    }
    return client.post(
        f"{BASE}/albums/{album_id}/photos",
        data=form,
        content_type="multipart/form-data",
    )


def test_gallery_upload_tags_and_consent(client, club):
    _login(client, "max@test.ch")
    assert client.post(f"{BASE}/albums", json={"title": "GV"}).status_code == 403

    _login(client, "gabi@test.ch")
    board_only = client.post(
        f"{BASE}/albums", json={"title": "Vorstand", "membersUpload": False}
    ).get_json()
    album = client.post(
        f"{BASE}/albums", json={"title": "Sommerfest", "takenOn": "2026-07-04"}
    ).get_json()
    assert album["canUpload"] and album["takenOn"] == "2026-07-04"

    _login(client, "max@test.ch")
    assert _upload(client, board_only["id"], _png()).status_code == 403
    done = _upload(client, album["id"], _png(3000, 1500), b"not an image")
    assert done.status_code == 201
    body = done.get_json()
    assert len(body["added"]) == 1 and len(body["failed"]) == 1
    photo = body["added"][0]
    assert photo["width"] == 2560 and photo["height"] == 1280

    thumb = client.get(f"{BASE}/photos/{photo['id']}/file?size=thumb")
    assert thumb.status_code == 200 and thumb.mimetype == "image/jpeg"
    from PIL import Image

    assert max(Image.open(io.BytesIO(thumb.data)).size) == 640

    albums = client.get(f"{BASE}/albums").get_json()
    summer = next(a for a in albums if a["id"] == album["id"])
    assert summer["photos"] == 1 and summer["coverPhotoId"] == photo["id"]

    # Lea doesn't want to be in photos; Max can tag himself but not her.
    _login(client, "lea@test.ch")
    assert client.put(f"{BASE}/consent", json={"allowed": False}).get_json() == {
        "photosOfMe": False
    }
    assert (
        client.patch(f"{BASE}/photos/{photo['id']}", json={"caption": "x"}).status_code
        == 403
    )
    _login(client, "max@test.ch")
    refused = client.patch(
        f"{BASE}/photos/{photo['id']}", json={"tags": [club["max"], club["lea"]]}
    )
    assert (
        refused.status_code == 409 and refused.get_json()["error"] == "NO_PHOTO_CONSENT"
    )
    tagged = client.patch(
        f"{BASE}/photos/{photo['id']}", json={"tags": [club["max"]], "caption": "Grill"}
    ).get_json()
    assert [t["name"] for t in tagged["items"][0]["tags"]] == ["Test Max"]
    client.delete(f"{BASE}/photos/{photo['id']}/tags/me")
    assert (
        client.get(f"{BASE}/albums/{album['id']}").get_json()["items"][0]["tags"] == []
    )

    # The gallery manager removes the album with its photos.
    _login(client, "gabi@test.ch")
    assert client.delete(f"{BASE}/albums/{album['id']}").status_code == 204
    assert client.get(f"{BASE}/photos/{photo['id']}/file").status_code == 404


def test_the_idea_box(client, db, club):
    from hubra.core.models.notification import Notification

    _login(client, "lea@test.ch")
    idea = client.post(
        f"{BASE}/ideas", json={"title": "Grillplatz beim Clubhaus", "anonymous": True}
    ).get_json()
    assert idea["votes"] == 1 and idea["voted"] and idea["author"] is None
    other = client.post(f"{BASE}/ideas", json={"title": "Neue Trikots"}).get_json()
    _login(client, "max@test.ch")
    assert client.post(f"{BASE}/ideas/{idea['id']}/vote").get_json()["votes"] == 2
    assert client.post(f"{BASE}/ideas/{other['id']}/answer", json={}).status_code == 403
    assert [i["title"] for i in client.get(f"{BASE}/ideas").get_json()] == [
        "Grillplatz beim Clubhaus",
        "Neue Trikots",
    ]

    _login(client, "ida@test.ch")
    answered = client.post(
        f"{BASE}/ideas/{other['id']}/answer",
        json={"status": "declined", "answer": "Erst nächste Saison."},
    ).get_json()
    assert answered["status"] == "declined" and answered["answeredBy"] == "Test Ida"
    told = db.session.query(Notification).filter(Notification.member_id == club["lea"])
    assert [n.msg for n in told] == ["Neue Trikots"]

    set_modules(True, "polls")
    polled = client.post(f"{BASE}/ideas/{idea['id']}/poll", json={}).get_json()
    assert polled["pollId"] and polled["status"] == "planned"
    assert client.post(f"{BASE}/ideas/{idea['id']}/poll", json={}).status_code == 409

    _login(client, "max@test.ch")
    assert client.post(f"{BASE}/ideas/{other['id']}/vote").status_code == 409
    _login(client, "lea@test.ch")
    assert client.delete(f"{BASE}/ideas/{other['id']}").status_code == 403


def test_honours_and_jubilees(app, client, db, club):
    from hubra.core.models.member import Member
    from hubra.core.models.notification import Notification
    from hubra_community import services

    today = date.today()
    soon = today + timedelta(days=5)
    max_ = db.session.get(Member, club["max"])
    max_.joined = soon.replace(year=soon.year - 25)
    lea = db.session.get(Member, club["lea"])
    lea.birthday = soon.replace(year=soon.year - 50)
    lea.joined = soon.replace(year=soon.year - 3)
    db.session.commit()

    _login(client, "hana@test.ch")
    got = client.get(f"{BASE}/jubilees?days=30").get_json()
    assert {(j["name"], j["kind"], j["years"]) for j in got} == {
        ("Test Max", "member", 25),
        ("Test Lea", "birthday", 50),
    }

    _login(client, "max@test.ch")
    assert client.get(f"{BASE}/jubilees").status_code == 403

    with app.test_request_context():
        assert services.notify_jubilees(today) > 0
        assert services.notify_jubilees(today) == 0
        db.session.commit()
    bells = db.session.query(Notification).filter(
        Notification.link == "/app/community/honours"
    )
    assert {n.member_id for n in bells} >= {club["hana"]}
    assert club["max"] not in {n.member_id for n in bells}


def test_honorary_members_are_a_tier(client, db, club):
    from hubra_community.models import CommunityHonour

    from hubra.core.models.member import Member, MembershipTier

    # Module settings live per club; the test app has none, so keep them here.
    store: dict = {}
    with (
        patch("hubra.core.modules.get_config", lambda code: dict(store)),
        patch(
            "hubra.core.modules.set_config",
            lambda code, config: store.update(config),
        ),
    ):
        _honorary_members(client, db, club, Member, MembershipTier, CommunityHonour)
    assert store == {"honour_tier_id": None}


def _honorary_members(client, db, club, Member, MembershipTier, CommunityHonour):

    honorary = MembershipTier(name="Ehrenmitglied")
    db.session.add(honorary)
    db.session.flush()
    max_ = db.session.get(Member, club["max"])
    max_.tier_id = honorary.id
    # An honour kept with 1.0, for Lea.
    db.session.add(
        CommunityHonour(member_id=club["lea"], title="Freimitglied", note="GV 2024")
    )
    db.session.commit()

    _login(client, "max@test.ch")
    got = client.get(f"{BASE}/honours").get_json()
    assert got["tier"] is None and got["members"] == []
    assert "tiers" not in got and "legacy" not in got
    assert (
        client.put(f"{BASE}/honours/tier", json={"tierId": honorary.id}).status_code
        == 403
    )
    assert (
        client.post(f"{BASE}/honours/legacy", json={"action": "move"}).status_code
        == 403
    )

    _login(client, "hana@test.ch")
    got = client.get(f"{BASE}/honours").get_json()
    assert [h["name"] for h in got["legacy"]] == ["Test Lea"]
    assert {t["name"]: t["members"] for t in got["tiers"]}["Ehrenmitglied"] == 1
    # Moving needs the tier first.
    assert (
        client.post(f"{BASE}/honours/legacy", json={"action": "move"}).status_code
        == 400
    )
    assert client.put(f"{BASE}/honours/tier", json={"tierId": 99999}).status_code == 400
    got = client.put(f"{BASE}/honours/tier", json={"tierId": honorary.id}).get_json()
    assert got["tier"]["name"] == "Ehrenmitglied"
    assert [h["name"] for h in got["members"]] == ["Test Max"]

    got = client.post(f"{BASE}/honours/legacy", json={"action": "move"}).get_json()
    assert [h["name"] for h in got["members"]] == ["Test Lea", "Test Max"]
    assert got["legacy"] == []
    assert db.session.get(Member, club["lea"]).tier_id == honorary.id

    # Every member sees who is in the tier, without the board's extras.
    _login(client, "lea@test.ch")
    got = client.get(f"{BASE}/honours").get_json()
    assert got["tier"]["id"] == honorary.id and len(got["members"]) == 2
    assert "tiers" not in got

    _login(client, "hana@test.ch")
    got = client.put(f"{BASE}/honours/tier", json={"tierId": None}).get_json()
    assert got["tier"] is None and got["members"] == []


def test_welcome_checklist(client, db, club):
    from hubra.core.models.member import Member

    old = db.session.get(Member, club["lea"])
    old.joined = date.today() - timedelta(days=400)
    db.session.commit()

    _login(client, "max@test.ch")
    assert client.get(f"{BASE}/welcome").get_json() == {"steps": [], "show": False}
    assert client.get(f"{BASE}/welcome/steps").status_code == 403

    _login(client, "wim@test.ch")
    first = client.post(
        f"{BASE}/welcome/steps",
        json={"title": "Zum Training kommen", "link": "/app/events"},
    ).get_json()
    client.post(
        f"{BASE}/welcome/steps", json={"title": "Foto hochladen", "auto": "photo"}
    )
    assert (
        client.post(
            f"{BASE}/welcome/steps", json={"title": "x", "link": "http://a"}
        ).status_code
        == 400
    )

    _login(client, "max@test.ch")
    mine = client.get(f"{BASE}/welcome").get_json()
    assert mine["show"] and [s["done"] for s in mine["steps"]] == [False, False]
    after = client.put(f"{BASE}/welcome/{first['id']}", json={"done": True}).get_json()
    assert [s["done"] for s in after["steps"]] == [True, False]
    photo_step = after["steps"][1]["id"]
    assert (
        client.put(f"{BASE}/welcome/{photo_step}", json={"done": True}).status_code
        == 400
    )

    max_ = db.session.get(Member, club["max"])
    max_.avatar = "avatars/max.png"
    db.session.commit()
    assert client.get(f"{BASE}/welcome").get_json()["show"] is False

    _login(client, "lea@test.ch")
    assert client.get(f"{BASE}/welcome").get_json()["show"] is False

    _login(client, "wim@test.ch")
    rows = client.get(f"{BASE}/welcome/progress").get_json()["members"]
    by = {r["name"]: r for r in rows}
    assert "Test Lea" not in by
    assert by["Test Max"]["done"] == 2
    assert by["Test Ida"]["missing"] == ["Zum Training kommen", "Foto hochladen"]


# ── Lending moved to Inventory ───────────────────────────────────────────────


def _old_entries(db, club):
    from hubra_community.models import CommunitySkill

    rows = [
        CommunitySkill(member_id=club["max"], kind="lend", title="Anhänger",
                       description="mit Plane"),
        CommunitySkill(member_id=club["lea"], kind="lend", title="Beamer"),
        CommunitySkill(member_id=club["max"], kind="skill", title="Elektriker"),
    ]
    db.session.add_all(rows)
    db.session.commit()
    return rows


def test_the_skills_tab_is_gone(client, club):
    _login(client, "max@test.ch")
    assert client.get(f"{BASE}/skills").status_code == 404


def test_lending_waits_for_inventory(db, club, monkeypatch):
    from hubra_community import services
    from hubra_community.models import CommunitySkill

    _old_entries(db, club)
    monkeypatch.setattr("hubra.core.contracts.available", lambda name: False)
    assert services.move_lending() == 0
    assert db.session.query(CommunitySkill).count() == 3


def test_lending_moves_to_inventory(db, club, monkeypatch):
    from hubra.core import contracts
    from hubra_community import services
    from hubra_community.models import CommunitySkill

    _old_entries(db, club)
    sent = []

    def fake_call(contract, /, *, actor=None, **data):
        assert contract == "inventory.items.lend" and actor is contracts.SYSTEM
        if data["name"] == "Beamer":
            raise contracts.ActionFailed("inventory broke")
        sent.append(data)
        return {"id": 1}

    monkeypatch.setattr("hubra.core.contracts.available", lambda name: True)
    monkeypatch.setattr("hubra.core.contracts.call", fake_call)
    assert services.move_lending() == 1
    db.session.commit()
    assert sent == [{"member_id": club["max"], "name": "Anhänger",
                     "description": "mit Plane"}]
    # The one Inventory failed on waits for the next run; what members can
    # do stays for Guides to copy into its qualifications.
    left = sorted(r.title for r in db.session.query(CommunitySkill))
    assert left == ["Beamer", "Elektriker"]


def test_lending_into_the_real_inventory(app, db, club):
    """With the Inventory plugin next to this one, the entries become items
    that stay the member's own."""
    pytest.importorskip("hubra_inventory")
    from hubra_community import services
    from hubra_community.models import CommunitySkill
    from hubra.core.contracts import registry

    if registry.get("inventory.items.lend") is None:
        pytest.skip("Inventory without inventory.items.lend")
    set_modules(True, "community", "inventory")
    _old_entries(db, club)
    assert services.move_lending() == 2
    db.session.commit()
    from sqlalchemy import text

    rows = db.session.execute(
        text("SELECT name, owner_id, visibility FROM inventory_items ORDER BY name")
    ).all()
    assert [tuple(r) for r in rows] == [
        ("Anhänger", club["max"], "private"),
        ("Beamer", club["lea"], "private"),
    ]
    assert [r.kind for r in db.session.query(CommunitySkill)] == ["skill"]


# ── Dashboard widgets ───────────────────────────────────────────────────────


def test_widgets(db, club):
    from hubra.core import contracts
    from hubra.core.models.member import Member
    from hubra_community.models import CommunityIdea, CommunityIdeaVote

    top = CommunityIdea(title="Grillplatz", status="planned")
    small = CommunityIdea(title="Neue Trikots", status="open")
    db.session.add_all([top, small, CommunityIdea(title="Erledigt", status="done")])
    db.session.flush()
    db.session.add_all([
        CommunityIdeaVote(idea_id=top.id, member_id=club["max"]),
        CommunityIdeaVote(idea_id=top.id, member_id=club["lea"]),
        CommunityIdeaVote(idea_id=small.id, member_id=club["max"]),
    ])
    lea = db.session.get(Member, club["lea"])
    soon = date.today() + timedelta(days=5)
    lea.birthday = soon.replace(year=soon.year - 50)
    db.session.commit()

    max_ = db.session.get(Member, club["max"])
    out = contracts.widget_data("community.ideas", {}, actor=max_)
    assert [i["label"] for i in out["items"]] == ["Grillplatz", "Neue Trikots"]
    assert out["items"][0]["sub"] in ("2 Stimmen · geplant", "2 votes · planned")
    assert out["total"] == 2

    hana = db.session.get(Member, club["hana"])
    out = contracts.widget_data("community.jubilees", {}, actor=hana)
    assert [i["label"] for i in out["items"]] == [lea.name]
    assert "50" in out["items"][0]["sub"]
    offered = [o.contract.name for o in contracts.widgets(actor=max_)]
    assert "community.ideas" in offered and "community.jubilees" not in offered
