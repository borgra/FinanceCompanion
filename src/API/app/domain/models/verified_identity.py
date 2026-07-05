from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class VerifiedIdentity:
    subject: str
    object_id: str
    tenant_id: str
    email: str
    display_name: str | None = None
    picture_url: str | None = None
