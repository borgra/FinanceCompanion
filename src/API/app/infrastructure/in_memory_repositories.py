from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from app.domain.exceptions import NotFoundError
from app.domain.models import (
    Account,
    AccountColumn,
    BudgetCategory,
    BudgetSubCategory,
    Holding,
    HoldingAccountPosition,
    IncomePeriod,
    IncomeSource,
    MonthlyRecord,
    SecurityMetadata,
    SecurityPayoutDetails,
    User,
)
from app.infrastructure.seed_data import clone_seed_data


def now_iso() -> str:
    return datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")


def _optional_float(value) -> float | None:
    return float(value) if value is not None else None


def _income_period_from_dict(data: dict) -> IncomePeriod:
    return IncomePeriod(
        id=data["id"],
        start_date=data["startDate"],
        end_date=data.get("endDate"),
        yearly_gross_amount=int(data["yearlyGrossAmount"]),
        net_percentage=int(data["netPercentage"]),
    )


def _income_source_from_dict(data: dict) -> IncomeSource:
    return IncomeSource(
        id=data["id"],
        name=data["name"],
        type=data["type"],
        cadence=data["cadence"],
        periods=[_income_period_from_dict(item) for item in data["periods"]],
        status=data["status"],
        created_at=data["createdAt"],
        updated_at=data["updatedAt"],
    )


def _budget_sub_category_from_dict(data: dict) -> BudgetSubCategory:
    return BudgetSubCategory(
        id=data["id"],
        category_id=data["categoryId"],
        name=data["name"],
        monthly_amount_usd=int(data["monthlyAmountUsd"]),
        created_at=data["createdAt"],
        updated_at=data["updatedAt"],
    )


def _budget_category_from_dict(data: dict) -> BudgetCategory:
    return BudgetCategory(
        id=data["id"],
        name=data["name"],
        color_hex=data["colorHex"],
        created_at=data["createdAt"],
        updated_at=data["updatedAt"],
        sub_categories=[_budget_sub_category_from_dict(item) for item in data.get("subCategories", [])],
    )


def _account_column_from_dict(data: dict) -> AccountColumn:
    return AccountColumn(
        id=data["id"],
        name=data["name"],
        icon=data.get("icon"),
        is_deleted=data.get("isDeleted"),
    )


def _monthly_record_from_dict(data: dict) -> MonthlyRecord:
    return MonthlyRecord(
        month=data["month"],
        credit=float(data["credit"]),
        outflows={key: float(value) for key, value in data["outflows"].items()},
        invest=float(data["invest"]),
        savings=float(data["savings"]),
    )


def _account_from_dict(data: dict) -> Account:
    return Account(
        id=data["id"],
        name=data["name"],
        type=data["type"],
        starting_balance=float(data["startingBalance"]),
        start_date=data["startDate"],
        yield_rate=float(data["yieldRate"]),
        assigned_income_source_ids=list(data.get("assignedIncomeSourceIds", [])),
        columns=[_account_column_from_dict(item) for item in data["columns"]],
        monthly_records=[_monthly_record_from_dict(item) for item in data["monthlyRecords"]],
        created_at=data["createdAt"],
        updated_at=data["updatedAt"],
        savings_account_id=data.get("savingsAccountId"),
        investment_account_type=data.get("investmentAccountType"),
        investment_brokerage=data.get("investmentBrokerage"),
        manage_holdings=bool(data.get("manageHoldings", False)),
        yearly_contribution=data.get("yearlyContribution"),
        employer_income_source_id=data.get("employerIncomeSourceId"),
        employer_match_rate_percent=data.get("employerMatchRatePercent"),
        employer_match_cap_percent=data.get("employerMatchCapPercent"),
        employer_match_start_date=data.get("employerMatchStartDate"),
        employer_match_amount=data.get("employerMatchAmount"),
        employer_match_percent=data.get("employerMatchPercent"),
    )


def _security_metadata_from_dict(data: dict) -> SecurityMetadata:
    source_payout_details = [
        _security_payout_details_from_dict(item)
        for item in data.get("sourcePayoutDetails", data.get("payoutDetails", []))
    ]
    manual_payout_details = [
        _security_payout_details_from_dict(item)
        for item in data.get("manualPayoutDetails", [])
    ]
    return SecurityMetadata(
        symbol=data["symbol"],
        name=data["name"],
        exchange=data["exchange"],
        asset_type=data["assetType"],
        currency=data["currency"],
        price=_optional_float(data.get("price")),
        sector=data.get("sector"),
        industry=data.get("industry"),
        pe_ratio=_optional_float(data.get("peRatio")),
        thirty_day_yield=_optional_float(data.get("thirtyDayYield")),
        fifty_two_week_low=_optional_float(data.get("fiftyTwoWeekLow")),
        fifty_two_week_high=_optional_float(data.get("fiftyTwoWeekHigh")),
        dividend_previous_year=_optional_float(data.get("dividendPreviousYear")),
        dividend_current_year=_optional_float(data.get("dividendCurrentYear")),
        dividend_growth_rate=_optional_float(data.get("dividendGrowthRate")),
        estimated_future_payout=_optional_float(data.get("estimatedFuturePayout")),
        dividend_status=data.get("dividendStatus"),
        sma20=_optional_float(data.get("sma20")),
        sma50=_optional_float(data.get("sma50")),
        sma200=_optional_float(data.get("sma200")),
        details_updated_at=data.get("detailsUpdatedAt"),
        details_status=data.get("detailsStatus"),
        payout_details=manual_payout_details or source_payout_details,
        source_payout_details=source_payout_details,
        manual_payout_details=manual_payout_details,
    )


def _security_payout_details_from_dict(data: dict) -> SecurityPayoutDetails:
    return SecurityPayoutDetails(
        ex_dividend_date=data["exDividendDate"],
        amount=float(data["amount"]),
        declaration_date=data.get("declarationDate"),
        record_date=data.get("recordDate"),
        payment_date=data.get("paymentDate"),
        source=data.get("source"),
        mode=data.get("mode", "source"),
    )


def _holding_account_position_from_dict(data: dict) -> HoldingAccountPosition:
    return HoldingAccountPosition(
        account_id=data["accountId"],
        quantity=float(data["quantity"]),
        cost_basis=float(data["costBasis"]) if data.get("costBasis") is not None else None,
    )


def _holding_from_dict(data: dict) -> Holding:
    return Holding(
        id=data["id"],
        security=_security_metadata_from_dict(data["security"]),
        account_positions=[
            _holding_account_position_from_dict(item)
            for item in data.get("accountPositions", [])
        ],
        created_at=data["createdAt"],
        updated_at=data["updatedAt"],
    )


class InMemoryDataStore:
    def __init__(self, allowed_email: str | None = None) -> None:
        data = clone_seed_data(allowed_email=allowed_email)
        self.users = {
            item["id"]: User(
                id=item["id"],
                email=item["email"],
                display_name=item["displayName"],
                identity_subject=item.get("identitySubject"),
                identity_object_id=item.get("identityObjectId"),
                identity_tenant_id=item.get("identityTenantId"),
                picture_url=item.get("pictureUrl"),
            )
            for item in data["users"]
        }
        self.income_sources = {
            user_id: [_income_source_from_dict(item) for item in items]
            for user_id, items in data["income_sources"].items()
        }
        self.budget_categories = {
            user_id: [_budget_category_from_dict(item) for item in items]
            for user_id, items in data["budget_categories"].items()
        }
        self.accounts = {
            user_id: [_account_from_dict(item) for item in items]
            for user_id, items in data["accounts"].items()
        }
        self.holdings = {
            user_id: [_holding_from_dict(item) for item in items]
            for user_id, items in data["holdings"].items()
        }


class InMemoryUserRepository:
    def __init__(self, store: InMemoryDataStore) -> None:
        self._store = store

    def get_by_email(self, email: str) -> User | None:
        return next((deepcopy(user) for user in self._store.users.values() if user.email.casefold() == email.casefold()), None)

    def get_by_id(self, user_id: str) -> User | None:
        user = self._store.users.get(user_id)
        return deepcopy(user) if user else None

    def update_identity_profile(
        self,
        user_id: str,
        *,
        subject: str,
        object_id: str,
        tenant_id: str,
        picture_url: str | None,
    ) -> User:
        user = self._store.users.get(user_id)
        if user is None:
            raise NotFoundError("User not found.")
        user.identity_subject = subject
        user.identity_object_id = object_id
        user.identity_tenant_id = tenant_id
        user.picture_url = picture_url
        return deepcopy(user)


class InMemoryIncomeSourceRepository:
    def __init__(self, store: InMemoryDataStore) -> None:
        self._store = store

    def list_for_user(self, user_id: str) -> list[IncomeSource]:
        return deepcopy(self._store.income_sources.get(user_id, []))

    def create_for_user(self, user_id: str, source: IncomeSource) -> IncomeSource:
        items = self._store.income_sources.setdefault(user_id, [])
        items.append(deepcopy(source))
        return deepcopy(source)

    def update_for_user(self, user_id: str, source_id: str, source: IncomeSource) -> IncomeSource:
        items = self._store.income_sources.setdefault(user_id, [])
        for index, item in enumerate(items):
            if item.id == source_id:
                items[index] = deepcopy(source)
                return deepcopy(source)
        raise NotFoundError("Income source not found.")

    def set_status_for_user(self, user_id: str, source_id: str, status: str) -> IncomeSource:
        items = self._store.income_sources.setdefault(user_id, [])
        for item in items:
            if item.id == source_id:
                item.status = status
                item.updated_at = now_iso()
                return deepcopy(item)
        raise NotFoundError("Income source not found.")


class InMemoryBudgetRepository:
    def __init__(self, store: InMemoryDataStore) -> None:
        self._store = store

    def list_categories_for_user(self, user_id: str) -> list[BudgetCategory]:
        return deepcopy(self._store.budget_categories.get(user_id, []))

    def create_category_for_user(self, user_id: str, category: BudgetCategory) -> BudgetCategory:
        items = self._store.budget_categories.setdefault(user_id, [])
        items.append(deepcopy(category))
        return deepcopy(category)

    def update_category_for_user(self, user_id: str, category_id: str, name: str, color_hex: str) -> BudgetCategory:
        for item in self._store.budget_categories.setdefault(user_id, []):
            if item.id == category_id:
                item.name = name
                item.color_hex = color_hex
                item.updated_at = now_iso()
                return deepcopy(item)
        raise NotFoundError("Budget category not found.")

    def delete_category_for_user(self, user_id: str, category_id: str) -> None:
        categories = self._store.budget_categories.setdefault(user_id, [])
        self._store.budget_categories[user_id] = [item for item in categories if item.id != category_id]

    def create_sub_category_for_user(self, user_id: str, sub_category: BudgetSubCategory) -> BudgetSubCategory:
        for category in self._store.budget_categories.setdefault(user_id, []):
            if category.id == sub_category.category_id:
                category.sub_categories.append(deepcopy(sub_category))
                return deepcopy(sub_category)
        raise NotFoundError("Budget category not found.")

    def update_sub_category_for_user(self, user_id: str, sub_category_id: str, name: str, monthly_amount_usd: int) -> BudgetSubCategory:
        for category in self._store.budget_categories.setdefault(user_id, []):
            for sub_category in category.sub_categories:
                if sub_category.id == sub_category_id:
                    sub_category.name = name
                    sub_category.monthly_amount_usd = monthly_amount_usd
                    sub_category.updated_at = now_iso()
                    return deepcopy(sub_category)
        raise NotFoundError("Budget sub-category not found.")

    def delete_sub_category_for_user(self, user_id: str, sub_category_id: str) -> None:
        for category in self._store.budget_categories.setdefault(user_id, []):
            category.sub_categories = [
                item for item in category.sub_categories if item.id != sub_category_id
            ]


class InMemoryAccountRepository:
    def __init__(self, store: InMemoryDataStore) -> None:
        self._store = store

    def list_for_user(self, user_id: str) -> list[Account]:
        return deepcopy(self._store.accounts.get(user_id, []))

    def create_for_user(self, user_id: str, account: Account) -> Account:
        items = self._store.accounts.setdefault(user_id, [])
        items.append(deepcopy(account))
        return deepcopy(account)

    def update_for_user(self, user_id: str, account_id: str, account: Account) -> Account:
        items = self._store.accounts.setdefault(user_id, [])
        for index, item in enumerate(items):
            if item.id == account_id:
                items[index] = deepcopy(account)
                return deepcopy(account)
        raise NotFoundError("Account not found.")

    def delete_for_user(self, user_id: str, account_id: str) -> None:
        items = self._store.accounts.setdefault(user_id, [])
        self._store.accounts[user_id] = [item for item in items if item.id != account_id]


class InMemoryHoldingRepository:
    def __init__(self, store: InMemoryDataStore) -> None:
        self._store = store

    def list_for_user(self, user_id: str) -> list[Holding]:
        return deepcopy(self._store.holdings.get(user_id, []))

    def create_for_user(self, user_id: str, holding: Holding) -> Holding:
        items = self._store.holdings.setdefault(user_id, [])
        items.append(deepcopy(holding))
        return deepcopy(holding)

    def update_for_user(self, user_id: str, holding_id: str, holding: Holding) -> Holding:
        items = self._store.holdings.setdefault(user_id, [])
        for index, item in enumerate(items):
            if item.id == holding_id:
                items[index] = deepcopy(holding)
                return deepcopy(holding)
        raise NotFoundError("Holding not found.")

    def delete_for_user(self, user_id: str, holding_id: str) -> None:
        items = self._store.holdings.setdefault(user_id, [])
        if not any(item.id == holding_id for item in items):
            raise NotFoundError("Holding not found.")
        self._store.holdings[user_id] = [item for item in items if item.id != holding_id]
