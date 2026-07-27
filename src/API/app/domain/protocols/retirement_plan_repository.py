from typing import Protocol

from app.domain.models import RetirementPlan


class RetirementPlanRepository(Protocol):
    def get_for_user(self, user_id: str) -> RetirementPlan | None: ...

    def put_for_user(self, user_id: str, plan: RetirementPlan) -> RetirementPlan: ...
