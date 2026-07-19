from app.domain.models import BudgetCategory, BudgetSubCategory
from app.domain.protocols import BudgetRepository


class ListBudgetCategories:
    def __init__(self, repository: BudgetRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> list[BudgetCategory]:
        return self._repository.list_categories_for_user(user_id)


class CreateBudgetCategory:
    def __init__(self, repository: BudgetRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, category: BudgetCategory) -> BudgetCategory:
        return self._repository.create_category_for_user(user_id, category)


class UpdateBudgetCategory:
    def __init__(self, repository: BudgetRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, category_id: str, name: str, color_hex: str, icon: str, is_essential: bool) -> BudgetCategory:
        return self._repository.update_category_for_user(user_id, category_id, name, color_hex, icon, is_essential)


class SaveBudgetCategoryDraft:
    def __init__(self, repository: BudgetRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, category: BudgetCategory) -> BudgetCategory:
        existing = next((item for item in self._repository.list_categories_for_user(user_id) if item.id == category.id), None)
        if existing is None:
            from app.domain.exceptions import NotFoundError
            raise NotFoundError("Budget category not found.")
        requested_ids = [item.id for item in category.sub_categories]
        if len(requested_ids) != len(set(requested_ids)):
            raise ValueError("Each budget sub-category may appear only once.")
        return self._repository.replace_category_for_user(user_id, category)

class DeleteBudgetCategory:
    def __init__(self, repository: BudgetRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, category_id: str) -> None:
        self._repository.delete_category_for_user(user_id, category_id)


class CreateBudgetSubCategory:
    def __init__(self, repository: BudgetRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, sub_category: BudgetSubCategory) -> BudgetSubCategory:
        return self._repository.create_sub_category_for_user(user_id, sub_category)


class UpdateBudgetSubCategory:
    def __init__(self, repository: BudgetRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, sub_category_id: str, name: str, monthly_amount_usd: int) -> BudgetSubCategory:
        return self._repository.update_sub_category_for_user(
            user_id, sub_category_id, name, monthly_amount_usd
        )


class DeleteBudgetSubCategory:
    def __init__(self, repository: BudgetRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, sub_category_id: str) -> None:
        self._repository.delete_sub_category_for_user(user_id, sub_category_id)

