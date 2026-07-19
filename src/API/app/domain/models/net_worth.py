from dataclasses import dataclass


@dataclass(slots=True)
class NetWorth:
    beginning_net_worth: float | None
    investment_snapshots: dict[str, dict[str, float]]
    updated_at: str
    track_mortgage_in_net_worth: bool = False
    mortgage_schedule: dict[str, float | str] | None = None
