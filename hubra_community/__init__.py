"""Community: what members do for and with each other.

- Gallery: photo albums. Photos are re-encoded on upload (no location or
  camera data is kept) and stored in Hubra's file store. Members who say
  "no photos of me" can't be tagged, and their tags go.
- Lending: what members lend to the club lives in Inventory now (items
  that stay the member's own); old entries move there by themselves.
- Ideas: members post suggestions (anonymous if they like), others vote,
  the board answers or turns one into a poll.
- Welcome: a checklist for new members; the board sees who is stuck.
- Honours: honorary members, and a reminder to the board of membership
  jubilees and round birthdays.

Permissions:
    community.galleries.update   create albums, manage every photo
    community.ideas.update       answer ideas and turn them into polls
    community.welcome.update     set the welcome steps, see who is stuck
    community.honours.update     keep honorary members, see jubilees
"""

from hubra.core.modules import Blueprint, Module, NavItem, Schedule

module = Module(
    code="community",
    name="Community",
    description="Gallery, ideas, welcome checklist and honours",
    default_enabled=False,
    depends_on=("members",),
    blueprints=(
        Blueprint("hubra_community.routes", "community_bp", "/api/v1/app/community"),
    ),
    nav=(
        NavItem(
            "/app/community",
            "shell.nav.community",
            "users-group",
            section="more",
            order=29,
        ),
    ),
    tasks=("hubra_community.tasks",),
    schedule=(
        Schedule("community-jubilees-daily", "hubra_community.tasks.jubilees", 86400.0),
        # Until every old "lend" entry is in Inventory; a no-op after that.
        Schedule("community-move-lending", "hubra_community.tasks.move_lending", 3600.0),
    ),
    tables=(
        "community_albums",
        "community_photos",
        "community_photo_tags",
        "community_photo_optouts",
        "community_skills",
        "community_ideas",
        "community_idea_votes",
        "community_honours",
        "community_welcome_steps",
        "community_welcome_done",
        "community_jubilee_notices",
    ),
    # Hubra's features it uses, through contracts (docs/contracts.md in hubra).
    consumes={
        "polls.poll.create": ">=1,<2",
        "inventory.items.lend": ">=1,<2",
    },
)
