import json
from unittest.mock import MagicMock

import pytest
from azure.core.exceptions import ResourceNotFoundError

from app.domain.models import (
    Account,
    AccountColumn,
    BudgetSubCategory,
    Holding,
    HoldingAccountPosition,
    IncomePeriod,
    IncomeSource,
    MonthlyRecord,
    SecurityMetadata,
    SecurityPayoutDetails,
)
from app.infrastructure.cosmos_repositories import (
    CosmosAccountRepository,
    CosmosBudgetRepository,
    CosmosHoldingRepository,
    CosmosIncomeSourceRepository,
    CosmosUserRepository,
)


@pytest.fixture
def mock_table_client():
    return MagicMock()


# --- UserRepository Tests ---

def test_user_repository_get_by_email_success(mock_table_client):
    repo = CosmosUserRepository(mock_table_client)
    
    def mock_get_entity(partition_key, row_key):
        if partition_key == "users_by_email":
            return {"PartitionKey": "users_by_email", "RowKey": "steve@example.com", "userId": "user-123"}
        elif partition_key == "user-123" and row_key == "profile":
            return {
                "PartitionKey": "user-123",
                "RowKey": "profile",
                "id": "user-123",
                "email": "steve@example.com",
                "displayName": "Steve",
                "identitySubject": "sub-1",
            }
        raise ResourceNotFoundError("Not Found")
        
    mock_table_client.get_entity.side_effect = mock_get_entity
    
    user = repo.get_by_email("steve@example.com")
    assert user is not None
    assert user.id == "user-123"
    assert user.email == "steve@example.com"
    assert user.display_name == "Steve"
    assert user.identity_subject == "sub-1"


def test_user_repository_get_by_email_not_found(mock_table_client):
    repo = CosmosUserRepository(mock_table_client)
    mock_table_client.get_entity.side_effect = ResourceNotFoundError("Not Found")
    
    user = repo.get_by_email("steve@example.com")
    assert user is None


def test_user_repository_get_by_id_success(mock_table_client):
    repo = CosmosUserRepository(mock_table_client)
    mock_table_client.get_entity.return_value = {
        "PartitionKey": "user-123",
        "RowKey": "profile",
        "id": "user-123",
        "email": "steve@example.com",
        "displayName": "Steve",
    }
    
    user = repo.get_by_id("user-123")
    assert user is not None
    assert user.id == "user-123"
    assert user.email == "steve@example.com"


def test_user_repository_get_by_id_not_found(mock_table_client):
    repo = CosmosUserRepository(mock_table_client)
    mock_table_client.get_entity.side_effect = ResourceNotFoundError("Not Found")
    
    user = repo.get_by_id("user-123")
    assert user is None


def test_user_repository_update_identity_profile_success(mock_table_client):
    repo = CosmosUserRepository(mock_table_client)
    mock_table_client.get_entity.return_value = {
        "PartitionKey": "user-123",
        "RowKey": "profile",
        "id": "user-123",
        "email": "steve@example.com",
        "displayName": "Steve",
        "identitySubject": None,
    }
    
    user = repo.update_identity_profile(
        "user-123",
        subject="new-sub",
        object_id="new-obj",
        tenant_id="new-tenant",
        picture_url="http://pic",
    )
    
    assert user.identity_subject == "new-sub"
    assert user.identity_object_id == "new-obj"
    assert user.identity_tenant_id == "new-tenant"
    assert user.picture_url == "http://pic"
    mock_table_client.upsert_entity.assert_called_once()


# --- IncomeSourceRepository Tests ---

def test_income_source_list_for_user(mock_table_client):
    repo = CosmosIncomeSourceRepository(mock_table_client)
    mock_table_client.query_entities.return_value = [
        {
            "PartitionKey": "user-123",
            "RowKey": "income_source:source-1",
            "id": "source-1",
            "name": "Job 1",
            "type": "Salary",
            "cadence": "Monthly",
            "status": "Active",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "periodsJson": json.dumps([
                {"id": "p1", "start_date": "2026-01-01", "yearly_gross_amount": 100000, "net_percentage": 75}
            ]),
        },
        {
            "PartitionKey": "user-123",
            "RowKey": "profile", # Should be ignored in income sources list
            "id": "user-123",
        }
    ]
    
    sources = repo.list_for_user("user-123")
    assert len(sources) == 1
    assert sources[0].id == "source-1"
    assert sources[0].name == "Job 1"
    assert len(sources[0].periods) == 1
    assert sources[0].periods[0].id == "p1"
    mock_table_client.query_entities.assert_called_once_with("PartitionKey eq 'user-123'")


def test_income_source_create_for_user(mock_table_client):
    repo = CosmosIncomeSourceRepository(mock_table_client)
    source = IncomeSource(
        id="source-1",
        name="Job 1",
        type="Salary",
        cadence="Monthly",
        periods=[IncomePeriod("p1", "2026-01-01", 100000, 75)],
        status="Active",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )
    
    created = repo.create_for_user("user-123", source)
    assert created.id == "source-1"
    mock_table_client.create_entity.assert_called_once()
    entity = mock_table_client.create_entity.call_args[0][0]
    assert entity["PartitionKey"] == "user-123"
    assert entity["RowKey"] == "income_source:source-1"
    assert "p1" in entity["periodsJson"]


# --- BudgetRepository Tests ---

def test_budget_category_list_and_sub_operations(mock_table_client):
    repo = CosmosBudgetRepository(mock_table_client)
    
    # List categories
    mock_table_client.query_entities.return_value = [
        {
            "PartitionKey": "user-123",
            "RowKey": "budget_category:cat-1",
            "id": "cat-1",
            "name": "Housing",
            "colorHex": "#ff0000",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "subCategoriesJson": json.dumps([
                {"id": "sub-1", "category_id": "cat-1", "name": "Rent", "monthly_amount_usd": 2000, "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"}
            ])
        }
    ]
    
    cats = repo.list_for_user = repo.list_categories_for_user("user-123")
    assert len(cats) == 1
    assert cats[0].id == "cat-1"
    assert cats[0].sub_categories[0].id == "sub-1"
    assert cats[0].sub_categories[0].name == "Rent"

    # Create sub category
    mock_table_client.get_entity.return_value = {
        "PartitionKey": "user-123",
        "RowKey": "budget_category:cat-1",
        "id": "cat-1",
        "name": "Housing",
        "colorHex": "#ff0000",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "subCategoriesJson": "[]"
    }
    
    new_sub = BudgetSubCategory("sub-2", "cat-1", "Power", 150, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")
    created_sub = repo.create_sub_category_for_user("user-123", new_sub)
    assert created_sub.id == "sub-2"
    mock_table_client.upsert_entity.assert_called_once()
    entity = mock_table_client.upsert_entity.call_args[0][0]
    assert "sub-2" in entity["subCategoriesJson"]


# --- AccountRepository Tests ---

def test_account_create_and_update(mock_table_client):
    repo = CosmosAccountRepository(mock_table_client)
    account = Account(
        id="acc-1",
        name="Checking",
        type="Checking",
        starting_balance=5000,
        start_date="2026-01-01",
        yield_rate=0.0,
        assigned_income_source_ids=["income-source-primary"],
        columns=[AccountColumn("col-1", "Rent", "home")],
        monthly_records=[MonthlyRecord("Jan-26", 4000, {"col-1": 1500}, 500, 200)],
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
        savings_account_id=None
    )
    
    created = repo.create_for_user("user-123", account)
    assert created.id == "acc-1"
    mock_table_client.create_entity.assert_called_once()
    
    # Update account
    mock_table_client.get_entity.return_value = {
        "PartitionKey": "user-123",
        "RowKey": "account:acc-1",
        "id": "acc-1",
        "startingBalance": 5000,
    }
    repo.update_for_user("user-123", "acc-1", account)
    mock_table_client.upsert_entity.assert_called_once()


def test_holding_stores_security_identity_and_details_separately(mock_table_client):
    repo = CosmosHoldingRepository(mock_table_client)
    holding = Holding(
        id="holding-1",
        security=SecurityMetadata(
            symbol="VTI",
            name="Vanguard Total Stock Market ETF",
            exchange="NYSE Arca",
            asset_type="ETF",
            currency="USD",
            price=315.12,
            sector="Diversified",
            industry="Broad Market",
            payout_details=[
                SecurityPayoutDetails(
                    ex_dividend_date="2026-06-28",
                    amount=0.45,
                    payment_date="2026-07-02",
                    source="dividends",
                )
            ],
        ),
        account_positions=[
            HoldingAccountPosition("acc-taxable-brokerage", 12.5, 3100),
            HoldingAccountPosition("acc-roth-ira", 4, 990),
        ],
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    created = repo.create_for_user("user-123", holding)

    assert created.id == "holding-1"
    mock_table_client.create_entity.assert_called_once()
    entity = mock_table_client.create_entity.call_args[0][0]
    assert entity["PartitionKey"] == "user-123"
    assert entity["RowKey"] == "holding:holding-1"
    assert entity["securitySymbol"] == "VTI"
    assert entity["securityName"] == "Vanguard Total Stock Market ETF"
    assert entity["securityExchange"] == "NYSE Arca"
    assert entity["securityAssetType"] == "ETF"
    assert entity["securityCurrency"] == "USD"
    assert "securityJson" not in entity

    security_details = json.loads(entity["securityDetails"])
    assert security_details["price"] == 315.12
    assert security_details["sector"] == "Diversified"
    assert security_details["industry"] == "Broad Market"
    assert "payoutDetails" not in security_details
    assert "dividends" not in security_details
    assert json.loads(entity["dividendsJson"]) == {
        "status": "recent",
        "payouts": [
            {
                "exDividendDate": "2026-06-28",
                "amount": 0.45,
                "declarationDate": None,
                "recordDate": None,
                "paymentDate": "2026-07-02",
                "source": "dividends",
            }
        ],
    }
    positions = json.loads(entity["accountPositionsJson"])
    assert positions == [
        {"accountId": "acc-taxable-brokerage", "quantity": 12.5, "costBasis": 3100},
        {"accountId": "acc-roth-ira", "quantity": 4, "costBasis": 990},
    ]


def test_holding_reads_new_dividend_section(mock_table_client):
    repo = CosmosHoldingRepository(mock_table_client)
    mock_table_client.query_entities.return_value = [
        {
            "PartitionKey": "user-123",
            "RowKey": "holding:holding-1",
            "entityId": "holding-1",
            "securitySymbol": "SCHD",
            "securityName": "Schwab U.S. Dividend Equity ETF",
            "securityExchange": "NYSE Arca",
            "securityAssetType": "ETF",
            "securityCurrency": "USD",
            "securityDetails": json.dumps({
                "price": 80.12,
                "detailsUpdatedAt": "2026-07-11T19:21:28.294379Z",
                "detailsStatus": "fresh",
            }),
            "dividendsJson": json.dumps({
                "status": "recent",
                "previousYear": 2.65,
                "currentYear": 1.34,
                "growthRate": -0.4943,
                "estimatedFuturePayout": 1.34,
                "payouts": [
                    {
                        "exDividendDate": "2026-06-25",
                        "amount": 0.26,
                        "declarationDate": "2026-06-20",
                        "recordDate": "2026-06-26",
                        "paymentDate": "2026-07-01",
                        "source": "dividends",
                    }
                ],
            }),
            "accountPositionsJson": json.dumps([
                {"accountId": "acc-1", "quantity": 25.0, "costBasis": 1900},
            ]),
            "createdAt": "2026-07-10T02:32:48.231011Z",
            "updatedAt": "2026-07-11T19:21:28.294379Z",
        }
    ]

    holdings = repo.list_for_user("user-123")

    security = holdings[0].security
    assert security.symbol == "SCHD"
    assert security.dividend_previous_year == 2.65
    assert security.dividend_current_year == 1.34
    assert security.dividend_growth_rate == -0.4943
    assert security.estimated_future_payout == 1.34
    assert security.dividend_status == "recent"
    assert security.payout_details[0].ex_dividend_date == "2026-06-25"
    assert security.payout_details[0].payment_date == "2026-07-01"


def test_holding_writes_none_recent_dividend_section_without_null_totals(mock_table_client):
    repo = CosmosHoldingRepository(mock_table_client)
    holding = Holding(
        id="holding-1",
        security=SecurityMetadata(
            symbol="BA",
            name="Boeing Company",
            exchange="United States",
            asset_type="Equity",
            currency="USD",
            price=229.66,
            dividend_status="none_recent",
        ),
        account_positions=[
            HoldingAccountPosition("acc-taxable-brokerage", 10, None),
        ],
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    repo.create_for_user("user-123", holding)

    entity = mock_table_client.create_entity.call_args[0][0]
    assert json.loads(entity["dividendsJson"]) == {
        "status": "none_recent",
        "payouts": [],
    }


def test_holding_reads_legacy_dividend_section_inside_security_details(mock_table_client):
    repo = CosmosHoldingRepository(mock_table_client)
    mock_table_client.query_entities.return_value = [
        {
            "PartitionKey": "user-123",
            "RowKey": "holding:holding-1",
            "entityId": "holding-1",
            "securitySymbol": "O",
            "securityName": "Realty Income Corp",
            "securityExchange": "United States",
            "securityAssetType": "Equity",
            "securityCurrency": "USD",
            "securityDetails": json.dumps({
                "price": 63.31,
                "dividends": {
                    "status": "recent",
                    "previousYear": 3.2155,
                    "currentYear": 1.8935,
                    "growthRate": -0.4111,
                    "estimatedFuturePayout": 1.8935,
                    "payouts": [
                        {
                            "exDividendDate": "2026-07-31",
                            "amount": 0.271,
                            "declarationDate": "2026-07-07",
                            "recordDate": "2026-07-31",
                            "paymentDate": "2026-08-14",
                            "source": "dividends",
                        }
                    ],
                },
            }),
            "accountPositionsJson": json.dumps([
                {"accountId": "acc-1", "quantity": 50.0, "costBasis": None},
            ]),
            "createdAt": "2026-07-12T01:09:42.896504Z",
            "updatedAt": "2026-07-12T01:09:47.544867Z",
        }
    ]

    holdings = repo.list_for_user("user-123")

    security = holdings[0].security
    assert security.dividend_previous_year == 3.2155
    assert security.dividend_current_year == 1.8935
    assert security.dividend_status == "recent"
    assert security.payout_details[0].ex_dividend_date == "2026-07-31"


def test_holding_reads_security_details_attribute(mock_table_client):
    repo = CosmosHoldingRepository(mock_table_client)
    mock_table_client.query_entities.return_value = [
        {
            "PartitionKey": "user-123",
            "RowKey": "holding:holding-1",
            "entityId": "holding-1",
            "securitySymbol": "MSFT",
            "securityName": "Microsoft Corporation",
            "securityExchange": "United States",
            "securityAssetType": "Equity",
            "securityCurrency": "USD",
            "securityDetails": json.dumps({
                "price": 385.1,
                "sector": "Technology",
                "industry": "Software",
                "peRatio": 34.2,
                "thirtyDayYield": None,
                "fiftyTwoWeekLow": 300.0,
                "fiftyTwoWeekHigh": 420.0,
                "dividendPreviousYear": 3.0,
                "dividendCurrentYear": 3.32,
                "dividendGrowthRate": 0.1067,
                "estimatedFuturePayout": 3.32,
                "sma20": 382.0,
                "sma50": 377.0,
                "sma200": 360.0,
                "detailsUpdatedAt": "2026-07-11T19:21:28.294379Z",
                "detailsStatus": "partial",
                "payoutDetails": [],
            }),
            "accountPositionsJson": json.dumps([
                {"accountId": "acc-1", "quantity": 50.0, "costBasis": None},
            ]),
            "createdAt": "2026-07-10T02:32:48.231011Z",
            "updatedAt": "2026-07-11T19:21:28.294379Z",
        }
    ]

    holdings = repo.list_for_user("user-123")

    assert len(holdings) == 1
    security = holdings[0].security
    assert security.symbol == "MSFT"
    assert security.name == "Microsoft Corporation"
    assert security.price == 385.1
    assert security.sector == "Technology"
    assert security.pe_ratio == 34.2
    assert security.details_status == "partial"
    assert holdings[0].account_positions[0].quantity == 50.0
