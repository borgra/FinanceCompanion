from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class User:
    id: str
    email: str
    display_name: str
    identity_subject: str | None = None
    identity_object_id: str | None = None
    identity_tenant_id: str | None = None
    picture_url: str | None = None
