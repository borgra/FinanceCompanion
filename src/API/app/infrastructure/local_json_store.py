from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from app.domain.models import (
    ContributionPlan,
    ExpenseChange,
    NetWorth,
    RetirementPlan,
    SocialSecurityPlan,
    User,
)
from app.infrastructure.in_memory_repositories import (
    InMemoryDataStore,
    _account_from_dict,
    _budget_category_from_dict,
    _holding_from_dict,
    _income_source_from_dict,
    _optional_float,
)

_REQUIRED_COLLECTIONS = ('users', 'income_sources', 'budget_categories', 'accounts', 'holdings', 'net_worth')


def _camel(value):
    if isinstance(value, dict):
        return {
            ''.join(part if index == 0 else part[:1].upper() + part[1:] for index, part in enumerate(key.split('_'))): _camel(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_camel(item) for item in value]
    return value


def _retirement_plan_from_dict(data: dict) -> RetirementPlan:
    def contribution(value: dict) -> ContributionPlan:
        return ContributionPlan(
            monthly_amount=float(value['monthlyAmount']),
            annual_increase_percent=float(value['annualIncreasePercent']),
            end_age=int(value['endAge']),
        )

    social_security = data['socialSecurity']
    return RetirementPlan(
        id=data['id'],
        name=data['name'],
        current_age=int(data['currentAge']),
        retirement_age=int(data['retirementAge']),
        longevity_age=int(data['longevityAge']),
        annual_roi_percent=float(data['annualRoiPercent']),
        withdrawal_rate_percent=float(data['withdrawalRatePercent']),
        annual_retirement_expense=float(data['annualRetirementExpense']),
        withdrawal_mode=data['withdrawalMode'],
        taxable_contribution=contribution(data['taxableContribution']),
        retirement_contribution=contribution(data['retirementContribution']),
        expense_changes=[
            ExpenseChange(age=int(item['age']), percent_change=float(item['percentChange']), label=item.get('label'))
            for item in data['expenseChanges']
        ],
        social_security=SocialSecurityPlan(
            enabled=bool(social_security['enabled']),
            claim_age=int(social_security['claimAge']),
            monthly_benefit=float(social_security['monthlyBenefit']),
            annual_cola_percent=float(social_security['annualColaPercent']),
        ),
        include_hsa_in_retirement=bool(data['includeHsaInRetirement']),
        updated_at=data['updatedAt'],
    )


class LocalJsonDataStore(InMemoryDataStore):
    """Persistent local store; canonical usage has one API writer."""

    def __init__(self, allowed_email: str, path: Path):
        self.persistence_path = path
        super().__init__(allowed_email=allowed_email)
        if not path.exists():
            self.save()
            return

        try:
            with path.open(encoding='utf-8') as handle:
                data = json.load(handle)
            if not isinstance(data, dict):
                raise TypeError('root must be an object')
            missing = [key for key in _REQUIRED_COLLECTIONS if key not in data]
            if missing:
                raise ValueError(f'missing collections: {", ".join(missing)}')
            if not isinstance(data['users'], list):
                raise TypeError('users must be a list')
            for key in ('income_sources', 'budget_categories', 'accounts', 'holdings', 'net_worth', 'retirement_plans'):
                if key in data and not isinstance(data[key], dict):
                    raise TypeError(f'{key} must be an object')

            for user_id, value in data['net_worth'].items():
                if not isinstance(value, dict) or not isinstance(value.get('updatedAt'), str):
                    raise TypeError(f'net_worth[{user_id}] must contain a string updatedAt')

            self.users = {
                item['id']: User(
                    id=item['id'], email=item['email'], display_name=item['displayName'],
                    identity_subject=item.get('identitySubject'), identity_object_id=item.get('identityObjectId'),
                    identity_tenant_id=item.get('identityTenantId'), picture_url=item.get('pictureUrl'),
                )
                for item in data['users']
            }
            self.income_sources = {key: [_income_source_from_dict(item) for item in items] for key, items in data['income_sources'].items()}
            self.budget_categories = {key: [_budget_category_from_dict(item) for item in items] for key, items in data['budget_categories'].items()}
            self.accounts = {key: [_account_from_dict(item) for item in items] for key, items in data['accounts'].items()}
            self.holdings = {key: [_holding_from_dict(item) for item in items] for key, items in data['holdings'].items()}
            self.net_worth = {
                key: NetWorth(
                    beginning_net_worth=_optional_float(item.get('beginningNetWorth')),
                    monthly_account_values=item.get('monthlyAccountValues', {}),
                    updated_at=item['updatedAt'],
                    track_mortgage_in_net_worth=bool(item.get('trackMortgageInNetWorth', False)),
                    mortgage_schedule=item.get('mortgageSchedule'),
                    net_worth_goal=int(item.get('netWorthGoal', 0) or 0),
                )
                for key, item in data['net_worth'].items()
            }
            self.retirement_plans = {
                key: _retirement_plan_from_dict(item)
                for key, item in data.get('retirement_plans', {}).items()
            }
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f'Invalid local JSON data at {path}: {exc}') from exc
        except (AttributeError, IndexError, KeyError, TypeError, ValueError, OverflowError) as exc:
            raise ValueError(f'Invalid local JSON data at {path}: {exc}') from exc

    def save(self):
        self.persistence_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            'users': [_camel(asdict(item)) for item in self.users.values()],
            'income_sources': {key: [_camel(asdict(item)) for item in items] for key, items in self.income_sources.items()},
            'budget_categories': {key: [_camel(asdict(item)) for item in items] for key, items in self.budget_categories.items()},
            'accounts': {key: [_camel(asdict(item)) for item in items] for key, items in self.accounts.items()},
            'holdings': {key: [_camel(asdict(item)) for item in items] for key, items in self.holdings.items()},
            'net_worth': {key: _camel(asdict(item)) for key, item in self.net_worth.items()},
            'retirement_plans': {key: _camel(asdict(item)) for key, item in self.retirement_plans.items()},
        }
        temporary = self.persistence_path.with_suffix(self.persistence_path.suffix + '.tmp')
        with temporary.open('w', encoding='utf-8', newline='') as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write('\n')
            handle.flush()
        temporary.replace(self.persistence_path)
