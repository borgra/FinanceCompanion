from typing import Protocol

from app.domain.models import NetWorth


class NetWorthRepository(Protocol):
    def get_for_user(self, user_id: str) -> NetWorth | None: ...

    def put_for_user(self, user_id: str, net_worth: NetWorth) -> NetWorth: ...
