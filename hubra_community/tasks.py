"""Celery task: tell the board about jubilees two weeks ahead."""

from __future__ import annotations

from datetime import date

from hubra.core.modules import per_tenant_job
from hubra.core.tasks import celery_app

from . import services


@celery_app.task(name="hubra_community.tasks.jubilees")
@per_tenant_job("community")
def jubilees() -> int:
    from hubra.core.extensions import db

    sent = services.notify_jubilees(date.today())
    db.session.commit()
    return sent


@celery_app.task(name="hubra_community.tasks.move_lending")
@per_tenant_job("community")
def move_lending() -> int:
    from hubra.core.extensions import db

    moved = services.move_lending()
    db.session.commit()
    return moved
