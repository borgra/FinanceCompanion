from app.domain.models import RetirementPlan
from app.domain.protocols import RetirementPlanRepository


class GetRetirementPlan:
    def __init__(self, repository: RetirementPlanRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> RetirementPlan | None:
        return self._repository.get_for_user(user_id)


class PutRetirementPlan:
    def __init__(self, repository: RetirementPlanRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, plan: RetirementPlan) -> RetirementPlan:
        return self._repository.put_for_user(user_id, plan)
