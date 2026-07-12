from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import asdict
from datetime import UTC, datetime

from azure.core.exceptions import ResourceNotFoundError
from azure.data.tables import TableClient

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


def now_iso() -> str:
    return datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")


def _optional_float(value) -> float | None:
    return float(value) if value is not None else None


def _nested_or_legacy(data: dict, nested: dict, nested_key: str, legacy_key: str):
    return nested.get(nested_key) if nested_key in nested else data.get(legacy_key)


# --- Conversion Helpers ---

def _user_from_entity(entity: dict) -> User:
    return User(
        id=entity.get("entityId") or entity.get("id") or entity.get("PartitionKey"),
        email=entity["email"],
        display_name=entity["displayName"],
        identity_subject=entity.get("identitySubject"),
        identity_object_id=entity.get("identityObjectId"),
        identity_tenant_id=entity.get("identityTenantId"),
        picture_url=entity.get("pictureUrl"),
    )


def _user_to_entity(user: User) -> dict:
    return {
        "PartitionKey": user.id,
        "RowKey": "profile",
        "entityId": user.id,
        "email": user.email,
        "displayName": user.display_name,
        "identitySubject": user.identity_subject,
        "identityObjectId": user.identity_object_id,
        "identityTenantId": user.identity_tenant_id,
        "pictureUrl": user.picture_url,
    }


def _income_source_from_entity(entity: dict) -> IncomeSource:
    periods_data = json.loads(entity.get("periodsJson", "[]"))
    periods = [
        IncomePeriod(
            id=p["id"],
            start_date=p["start_date"],
            yearly_gross_amount=p["yearly_gross_amount"],
            net_percentage=p["net_percentage"],
            end_date=p.get("end_date"),
        )
        for p in periods_data
    ]
    return IncomeSource(
        id=entity.get("entityId") or entity.get("id") or entity["RowKey"].split(":", 1)[1],
        name=entity["name"],
        type=entity["type"],
        cadence=entity["cadence"],
        periods=periods,
        status=entity["status"],
        created_at=entity["createdAt"],
        updated_at=entity["updatedAt"],
    )


def _income_source_to_entity(user_id: str, source: IncomeSource) -> dict:
    return {
        "PartitionKey": user_id,
        "RowKey": f"income_source:{source.id}",
        "entityId": source.id,
        "name": source.name,
        "type": source.type,
        "cadence": source.cadence,
        "status": source.status,
        "createdAt": source.created_at,
        "updatedAt": source.updated_at,
        "periodsJson": json.dumps([asdict(p) for p in source.periods]),
    }


def _budget_category_from_entity(entity: dict) -> BudgetCategory:
    sub_data = json.loads(entity.get("subCategoriesJson", "[]"))
    sub_categories = [
        BudgetSubCategory(
            id=s["id"],
            category_id=s["category_id"],
            name=s["name"],
            monthly_amount_usd=s["monthly_amount_usd"],
            created_at=s["created_at"],
            updated_at=s["updated_at"],
        )
        for s in sub_data
    ]
    return BudgetCategory(
        id=entity.get("entityId") or entity.get("id") or entity["RowKey"].split(":", 1)[1],
        name=entity["name"],
        color_hex=entity["colorHex"],
        created_at=entity["createdAt"],
        updated_at=entity["updatedAt"],
        sub_categories=sub_categories,
    )


def _budget_category_to_entity(user_id: str, category: BudgetCategory) -> dict:
    return {
        "PartitionKey": user_id,
        "RowKey": f"budget_category:{category.id}",
        "entityId": category.id,
        "name": category.name,
        "colorHex": category.color_hex,
        "createdAt": category.created_at,
        "updatedAt": category.updated_at,
        "subCategoriesJson": json.dumps([asdict(s) for s in category.sub_categories]),
    }


def _account_from_entity(entity: dict) -> Account:
    cols_data = json.loads(entity.get("columnsJson", "[]"))
    columns = [
        AccountColumn(
            id=c["id"],
            name=c["name"],
            icon=c.get("icon"),
            is_deleted=c.get("is_deleted"),
        )
        for c in cols_data
    ]
    records_data = json.loads(entity.get("monthlyRecordsJson", "[]"))
    monthly_records = [
        MonthlyRecord(
            month=r["month"],
            credit=float(r["credit"]),
            outflows={k: float(v) for k, v in r["outflows"].items()},
            invest=float(r["invest"]),
            savings=float(r["savings"]),
        )
        for r in records_data
    ]
    return Account(
        id=entity.get("entityId") or entity.get("id") or entity["RowKey"].split(":", 1)[1],
        name=entity["name"],
        type=entity["type"],
        starting_balance=float(entity["startingBalance"]),
        start_date=entity["startDate"],
        yield_rate=float(entity["yieldRate"]),
        assigned_income_source_ids=json.loads(entity.get("assignedIncomeSourceIdsJson", "[]")),
        columns=columns,
        monthly_records=monthly_records,
        created_at=entity["createdAt"],
        updated_at=entity["updatedAt"],
        savings_account_id=entity.get("savingsAccountId"),
        investment_account_type=entity.get("investmentAccountType"),
        investment_brokerage=entity.get("investmentBrokerage"),
        manage_holdings=bool(entity.get("manageHoldings", False)),
        yearly_contribution=(
            float(entity["yearlyContribution"])
            if entity.get("yearlyContribution") is not None
            else None
        ),
        employer_income_source_id=entity.get("employerIncomeSourceId"),
        employer_match_rate_percent=(
            float(entity["employerMatchRatePercent"])
            if entity.get("employerMatchRatePercent") is not None
            else None
        ),
        employer_match_cap_percent=(
            float(entity["employerMatchCapPercent"])
            if entity.get("employerMatchCapPercent") is not None
            else None
        ),
        employer_match_start_date=entity.get("employerMatchStartDate"),
        employer_match_amount=(
            float(entity["employerMatchAmount"])
            if entity.get("employerMatchAmount") is not None
            else None
        ),
        employer_match_percent=(
            float(entity["employerMatchPercent"])
            if entity.get("employerMatchPercent") is not None
            else None
        ),
    )


def _account_to_entity(user_id: str, account: Account) -> dict:
    return {
        "PartitionKey": user_id,
        "RowKey": f"account:{account.id}",
        "entityId": account.id,
        "name": account.name,
        "type": account.type,
        "startingBalance": account.starting_balance,
        "startDate": account.start_date,
        "yieldRate": account.yield_rate,
        "assignedIncomeSourceIdsJson": json.dumps(account.assigned_income_source_ids),
        "createdAt": account.created_at,
        "updatedAt": account.updated_at,
        "columnsJson": json.dumps([asdict(c) for c in account.columns]),
        "monthlyRecordsJson": json.dumps([asdict(r) for r in account.monthly_records]),
        "savingsAccountId": account.savings_account_id,
        "investmentAccountType": account.investment_account_type,
        "investmentBrokerage": account.investment_brokerage,
        "manageHoldings": account.manage_holdings,
        "yearlyContribution": account.yearly_contribution,
        "employerIncomeSourceId": account.employer_income_source_id,
        "employerMatchRatePercent": account.employer_match_rate_percent,
        "employerMatchCapPercent": account.employer_match_cap_percent,
        "employerMatchStartDate": account.employer_match_start_date,
        "employerMatchAmount": account.employer_match_amount,
        "employerMatchPercent": account.employer_match_percent,
    }


def _security_metadata_from_dict(data: dict) -> SecurityMetadata:
    dividends = data.get("dividends") or {}
    payouts_data = dividends.get("payouts") or data.get("payoutDetails", [])
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
        dividend_previous_year=_optional_float(_nested_or_legacy(
            data,
            dividends,
            "previousYear",
            "dividendPreviousYear",
        )),
        dividend_current_year=_optional_float(_nested_or_legacy(
            data,
            dividends,
            "currentYear",
            "dividendCurrentYear",
        )),
        dividend_growth_rate=_optional_float(_nested_or_legacy(
            data,
            dividends,
            "growthRate",
            "dividendGrowthRate",
        )),
        estimated_future_payout=_optional_float(
            _nested_or_legacy(
                data,
                dividends,
                "estimatedFuturePayout",
                "estimatedFuturePayout",
            )
        ),
        sma20=_optional_float(data.get("sma20")),
        sma50=_optional_float(data.get("sma50")),
        sma200=_optional_float(data.get("sma200")),
        details_updated_at=data.get("detailsUpdatedAt"),
        details_status=data.get("detailsStatus"),
        payout_details=[
            _security_payout_details_from_dict(item)
            for item in payouts_data
        ],
    )


def _security_payout_details_from_dict(data: dict) -> SecurityPayoutDetails:
    return SecurityPayoutDetails(
        ex_dividend_date=data["exDividendDate"],
        amount=float(data["amount"]),
        declaration_date=data.get("declarationDate"),
        record_date=data.get("recordDate"),
        payment_date=data.get("paymentDate"),
        source=data.get("source"),
    )


def _security_payout_details_to_dict(payout: SecurityPayoutDetails) -> dict:
    return {
        "exDividendDate": payout.ex_dividend_date,
        "amount": payout.amount,
        "declarationDate": payout.declaration_date,
        "recordDate": payout.record_date,
        "paymentDate": payout.payment_date,
        "source": payout.source,
    }


def _security_metadata_to_dict(security: SecurityMetadata) -> dict:
    return {
        "symbol": security.symbol,
        "name": security.name,
        "exchange": security.exchange,
        "assetType": security.asset_type,
        "currency": security.currency,
        "price": security.price,
        "sector": security.sector,
        "industry": security.industry,
        "peRatio": security.pe_ratio,
        "thirtyDayYield": security.thirty_day_yield,
        "fiftyTwoWeekLow": security.fifty_two_week_low,
        "fiftyTwoWeekHigh": security.fifty_two_week_high,
        "dividends": _security_dividends_to_dict(security),
        "sma20": security.sma20,
        "sma50": security.sma50,
        "sma200": security.sma200,
        "detailsUpdatedAt": security.details_updated_at,
        "detailsStatus": security.details_status,
    }


def _security_dividends_to_dict(security: SecurityMetadata) -> dict:
    return {
        "previousYear": security.dividend_previous_year,
        "currentYear": security.dividend_current_year,
        "growthRate": security.dividend_growth_rate,
        "estimatedFuturePayout": security.estimated_future_payout,
        "payouts": [
            _security_payout_details_to_dict(payout)
            for payout in security.payout_details
        ],
    }


def _security_details_to_dict(security: SecurityMetadata) -> dict:
    return {
        "price": security.price,
        "sector": security.sector,
        "industry": security.industry,
        "peRatio": security.pe_ratio,
        "thirtyDayYield": security.thirty_day_yield,
        "fiftyTwoWeekLow": security.fifty_two_week_low,
        "fiftyTwoWeekHigh": security.fifty_two_week_high,
        "sma20": security.sma20,
        "sma50": security.sma50,
        "sma200": security.sma200,
        "detailsUpdatedAt": security.details_updated_at,
        "detailsStatus": security.details_status,
    }


def _security_metadata_from_entity(entity: dict) -> SecurityMetadata:
    if entity.get("securityJson"):
        return _security_metadata_from_dict(json.loads(entity["securityJson"]))

    security_details = json.loads(entity.get("securityDetails", "{}"))
    dividends = json.loads(entity.get("dividendsJson", "{}"))
    data = {
        "symbol": entity["securitySymbol"],
        "name": entity["securityName"],
        "exchange": entity["securityExchange"],
        "assetType": entity["securityAssetType"],
        "currency": entity["securityCurrency"],
        **security_details,
    }
    if dividends:
        data["dividends"] = dividends
    return _security_metadata_from_dict(data)


def _holding_account_position_from_dict(data: dict) -> HoldingAccountPosition:
    return HoldingAccountPosition(
        account_id=data["accountId"],
        quantity=float(data["quantity"]),
        cost_basis=float(data["costBasis"]) if data.get("costBasis") is not None else None,
    )


def _holding_account_position_to_dict(position: HoldingAccountPosition) -> dict:
    return {
        "accountId": position.account_id,
        "quantity": position.quantity,
        "costBasis": position.cost_basis,
    }


def _holding_from_entity(entity: dict) -> Holding:
    positions_data = json.loads(entity.get("accountPositionsJson", "[]"))
    return Holding(
        id=entity.get("entityId") or entity.get("id") or entity["RowKey"].split(":", 1)[1],
        security=_security_metadata_from_entity(entity),
        account_positions=[
            _holding_account_position_from_dict(item)
            for item in positions_data
        ],
        created_at=entity["createdAt"],
        updated_at=entity["updatedAt"],
    )


def _holding_to_entity(user_id: str, holding: Holding) -> dict:
    return {
        "PartitionKey": user_id,
        "RowKey": f"holding:{holding.id}",
        "entityId": holding.id,
        "securitySymbol": holding.security.symbol,
        "securityName": holding.security.name,
        "securityExchange": holding.security.exchange,
        "securityAssetType": holding.security.asset_type,
        "securityCurrency": holding.security.currency,
        "createdAt": holding.created_at,
        "updatedAt": holding.updated_at,
        "securityDetails": json.dumps(_security_details_to_dict(holding.security)),
        "dividendsJson": json.dumps(_security_dividends_to_dict(holding.security)),
        "accountPositionsJson": json.dumps([
            _holding_account_position_to_dict(item)
            for item in holding.account_positions
        ]),
    }


# --- Repository Implementations ---

class CosmosUserRepository:
    def __init__(self, client: TableClient) -> None:
        self._client = client

    def get_by_email(self, email: str) -> User | None:
        try:
            mapping = self._client.get_entity("users_by_email", email.casefold())
            user_id = mapping["userId"]
            entity = self._client.get_entity(user_id, "profile")
            return _user_from_entity(entity)
        except ResourceNotFoundError:
            return None

    def get_by_id(self, user_id: str) -> User | None:
        try:
            entity = self._client.get_entity(user_id, "profile")
            return _user_from_entity(entity)
        except ResourceNotFoundError:
            return None

    def update_identity_profile(
        self,
        user_id: str,
        *,
        subject: str,
        object_id: str,
        tenant_id: str,
        picture_url: str | None,
    ) -> User:
        try:
            entity = self._client.get_entity(user_id, "profile")
        except ResourceNotFoundError as exc:
            raise NotFoundError("User profile not found.") from exc

        entity["identitySubject"] = subject
        entity["identityObjectId"] = object_id
        entity["identityTenantId"] = tenant_id
        entity["pictureUrl"] = picture_url
        self._client.upsert_entity(entity)
        return _user_from_entity(entity)


class CosmosIncomeSourceRepository:
    def __init__(self, client: TableClient) -> None:
        self._client = client

    def list_for_user(self, user_id: str) -> list[IncomeSource]:
        entities = self._client.query_entities(f"PartitionKey eq '{user_id}'")
        return [
            _income_source_from_entity(e)
            for e in entities
            if e["RowKey"].startswith("income_source:")
        ]

    def create_for_user(self, user_id: str, source: IncomeSource) -> IncomeSource:
        entity = _income_source_to_entity(user_id, source)
        self._client.create_entity(entity)
        return deepcopy(source)

    def update_for_user(self, user_id: str, source_id: str, source: IncomeSource) -> IncomeSource:
        try:
            self._client.get_entity(user_id, f"income_source:{source_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Income source not found.") from exc

        entity = _income_source_to_entity(user_id, source)
        self._client.upsert_entity(entity)
        return deepcopy(source)

    def set_status_for_user(self, user_id: str, source_id: str, status: str) -> IncomeSource:
        try:
            entity = self._client.get_entity(user_id, f"income_source:{source_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Income source not found.") from exc

        source = _income_source_from_entity(entity)
        source.status = status
        source.updated_at = now_iso()
        
        updated_entity = _income_source_to_entity(user_id, source)
        self._client.upsert_entity(updated_entity)
        return source


class CosmosBudgetRepository:
    def __init__(self, client: TableClient) -> None:
        self._client = client

    def list_categories_for_user(self, user_id: str) -> list[BudgetCategory]:
        entities = self._client.query_entities(f"PartitionKey eq '{user_id}'")
        return [
            _budget_category_from_entity(e)
            for e in entities
            if e["RowKey"].startswith("budget_category:")
        ]

    def create_category_for_user(self, user_id: str, category: BudgetCategory) -> BudgetCategory:
        entity = _budget_category_to_entity(user_id, category)
        self._client.create_entity(entity)
        return deepcopy(category)

    def update_category_for_user(self, user_id: str, category_id: str, name: str, color_hex: str) -> BudgetCategory:
        try:
            entity = self._client.get_entity(user_id, f"budget_category:{category_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Budget category not found.") from exc

        category = _budget_category_from_entity(entity)
        category.name = name
        category.color_hex = color_hex
        category.updated_at = now_iso()

        updated_entity = _budget_category_to_entity(user_id, category)
        self._client.upsert_entity(updated_entity)
        return category

    def delete_category_for_user(self, user_id: str, category_id: str) -> None:
        try:
            self._client.delete_entity(user_id, f"budget_category:{category_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Budget category not found.") from exc

    def create_sub_category_for_user(self, user_id: str, sub_category: BudgetSubCategory) -> BudgetSubCategory:
        try:
            entity = self._client.get_entity(user_id, f"budget_category:{sub_category.category_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Budget category not found.") from exc

        category = _budget_category_from_entity(entity)
        category.sub_categories.append(deepcopy(sub_category))
        
        updated_entity = _budget_category_to_entity(user_id, category)
        self._client.upsert_entity(updated_entity)
        return deepcopy(sub_category)

    def update_sub_category_for_user(
        self,
        user_id: str,
        sub_category_id: str,
        name: str,
        monthly_amount_usd: int,
    ) -> BudgetSubCategory:
        categories = self.list_categories_for_user(user_id)
        target_cat = None
        target_sub = None
        
        for cat in categories:
            for sub in cat.sub_categories:
                if sub.id == sub_category_id:
                    target_cat = cat
                    target_sub = sub
                    break
            if target_cat:
                break
                
        if not target_cat or not target_sub:
            raise NotFoundError("Budget sub-category not found.")

        target_sub.name = name
        target_sub.monthly_amount_usd = monthly_amount_usd
        target_sub.updated_at = now_iso()

        updated_entity = _budget_category_to_entity(user_id, target_cat)
        self._client.upsert_entity(updated_entity)
        return deepcopy(target_sub)

    def delete_sub_category_for_user(self, user_id: str, sub_category_id: str) -> None:
        categories = self.list_categories_for_user(user_id)
        target_cat = None
        
        for cat in categories:
            if any(sub.id == sub_category_id for sub in cat.sub_categories):
                target_cat = cat
                break
                
        if not target_cat:
            raise NotFoundError("Budget sub-category not found.")

        target_cat.sub_categories = [s for s in target_cat.sub_categories if s.id != sub_category_id]
        updated_entity = _budget_category_to_entity(user_id, target_cat)
        self._client.upsert_entity(updated_entity)


class CosmosAccountRepository:
    def __init__(self, client: TableClient) -> None:
        self._client = client

    def list_for_user(self, user_id: str) -> list[Account]:
        entities = self._client.query_entities(f"PartitionKey eq '{user_id}'")
        return [
            _account_from_entity(e)
            for e in entities
            if e["RowKey"].startswith("account:")
        ]

    def create_for_user(self, user_id: str, account: Account) -> Account:
        entity = _account_to_entity(user_id, account)
        self._client.create_entity(entity)
        return deepcopy(account)

    def update_for_user(self, user_id: str, account_id: str, account: Account) -> Account:
        try:
            self._client.get_entity(user_id, f"account:{account_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Account not found.") from exc

        entity = _account_to_entity(user_id, account)
        self._client.upsert_entity(entity)
        return deepcopy(account)

    def delete_for_user(self, user_id: str, account_id: str) -> None:
        try:
            self._client.delete_entity(user_id, f"account:{account_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Account not found.") from exc


class CosmosHoldingRepository:
    def __init__(self, client: TableClient) -> None:
        self._client = client

    def list_for_user(self, user_id: str) -> list[Holding]:
        entities = self._client.query_entities(f"PartitionKey eq '{user_id}'")
        return [
            _holding_from_entity(e)
            for e in entities
            if e["RowKey"].startswith("holding:")
        ]

    def create_for_user(self, user_id: str, holding: Holding) -> Holding:
        entity = _holding_to_entity(user_id, holding)
        self._client.create_entity(entity)
        return deepcopy(holding)

    def update_for_user(self, user_id: str, holding_id: str, holding: Holding) -> Holding:
        try:
            self._client.get_entity(user_id, f"holding:{holding_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Holding not found.") from exc

        entity = _holding_to_entity(user_id, holding)
        self._client.upsert_entity(entity)
        return deepcopy(holding)

    def delete_for_user(self, user_id: str, holding_id: str) -> None:
        try:
            self._client.delete_entity(user_id, f"holding:{holding_id}")
        except ResourceNotFoundError as exc:
            raise NotFoundError("Holding not found.") from exc
