import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import { IncomeSourcesPage } from '../features/incomeSources/IncomeSourcesPage';
import { BudgetPage } from './BudgetPage';
import { useState } from 'react';

export type SettingsConfigurationPanelProps = {
  repository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
};

export function SettingsConfigurationPanel({
  repository,
  budgetRepository,
}: SettingsConfigurationPanelProps) {
  const [tab, setTab] = useState<'income' | 'budget'>('income');

  return (
    <div className="settings-configuration-panel">
      <section className="toolbar" aria-label="Configuration sections">
        <div className="filter-tabs" role="tablist" aria-label="Configuration tabs">
          <button
            className="filter-tab"
            type="button"
            role="tab"
            aria-selected={tab === 'income'}
            onClick={() => setTab('income')}
          >
            Income Management
          </button>
          <button
            className="filter-tab"
            type="button"
            role="tab"
            aria-selected={tab === 'budget'}
            onClick={() => setTab('budget')}
          >
            Budget
          </button>
        </div>
      </section>

      {tab === 'income' ? (
        <IncomeSourcesPage
          repository={repository}
          layout="embedded"
          headerEyebrow="Configuration"
        />
      ) : (
        <BudgetPage
          incomeRepository={repository}
          budgetRepository={budgetRepository}
        />
      )}
    </div>
  );
}
