import json
import re

import pytest

from app.domain.models import ContributionPlan, ExpenseChange, RetirementPlan, SocialSecurityPlan
from app.infrastructure.local_json_store import LocalJsonDataStore


def plan():
    return RetirementPlan(
        id='base-plan', name='Base Plan', current_age=45, retirement_age=58, longevity_age=95,
        annual_roi_percent=6.5, withdrawal_rate_percent=4, annual_retirement_expense=72000,
        withdrawal_mode='meet_expense',
        taxable_contribution=ContributionPlan(500, 3, 60),
        retirement_contribution=ContributionPlan(750, 2, 65),
        expense_changes=[ExpenseChange(63, -20, 'Mortgage paid off')],
        social_security=SocialSecurityPlan(True, 67, 2800, 2),
        include_hsa_in_retirement=False, updated_at='2026-01-01T00:00:00Z',
    )


def test_retirement_plan_survives_store_restart(tmp_path):
    path = tmp_path / 'finance.json'
    first = LocalJsonDataStore('local@example.test', path)
    first.retirement_plans['user-steve'] = plan()
    first.save()

    second = LocalJsonDataStore('local@example.test', path)
    restored = second.retirement_plans['user-steve']
    assert restored == plan()


@pytest.mark.parametrize('mutation', [
    lambda data: data.update({'users': {}}),
    lambda data: data['accounts'].update({'user-steve': 'not-a-list'}),
    lambda data: data['net_worth'].update({'user-steve': {'updatedAt': 3}}),
])
def test_malformed_json_has_consistent_error_and_is_not_overwritten(tmp_path, mutation):
    path = tmp_path / 'finance.json'
    store = LocalJsonDataStore('local@example.test', path)
    store.save()
    data = json.loads(path.read_text())
    mutation(data)
    original = json.dumps(data, indent=2, sort_keys=True) + '\n'
    path.write_text(original)

    with pytest.raises(ValueError, match=rf'Invalid local JSON data at {re.escape(str(path))}'):
        LocalJsonDataStore('local@example.test', path)
    assert path.read_text() == original
