import json
from unittest.mock import MagicMock

import pytest
from azure.core.exceptions import ResourceNotFoundError

from app.domain.models import (
    Account,
    AccountColumn,
    BudgetSubCategory,
    IncomePeriod,
    IncomeSource,
    MonthlyRecord,
)
from app.infrastructure.cosmos_repositories import (
    CosmosAccountRepository,
    CosmosBudgetRepository,
    CosmosIncomeSourceRepository,
    CosmosUserRepository,
    seed_cosmos_database,
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


# --- Database Seeding Test ---

def test_seed_cosmos_database(mock_table_client):
    # If user mapping doesn't exist, we must seed
    mock_table_client.get_entity.side_effect = ResourceNotFoundError("Not found")
    
    seed_cosmos_database(mock_table_client, "steveborgra@gmail.com")
    
    # We expect upsert_entity to be called many times to write users, accounts, budgets, and income sources
    assert mock_table_client.upsert_entity.call_count > 5
