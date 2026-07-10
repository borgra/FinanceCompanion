import { useMemo, useState } from 'react';
import type { AccountRepository } from '../domain/accountRepository';
import type { HoldingRepository } from '../domain/holdingRepository';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import { FundingSchedulePage } from './FundingSchedulePage';
import { HoldingsPage } from './HoldingsPage';
import { PassiveIncomePage } from './PassiveIncomePage';

type InvestingSectionId =
  | 'funding-schedule'
  | 'holdings'
  | 'passive-income'
  | 'retirement-planning';

type InvestingSection = {
  id: InvestingSectionId;
  label: string;
  title: string;
  description: string;
};

const investingSections: InvestingSection[] = [
  {
    id: 'funding-schedule',
    label: 'Funding Schedule',
    title: 'Funding Schedule',
    description: 'Plan recurring contributions and upcoming transfer timing.',
  },
  {
    id: 'holdings',
    label: 'Holdings',
    title: 'Holdings',
    description: 'Review current positions, allocation, and portfolio balance.',
  },
  {
    id: 'passive-income',
    label: 'Passive Income',
    title: 'Passive Income',
    description: 'Track dividends, distributions, and expected recurring income.',
  },
  {
    id: 'retirement-planning',
    label: 'Retirement Planning',
    title: 'Retirement Planning',
    description: 'Model long-term targets, timelines, and retirement readiness.',
  },
];

type InvestingPageProps = {
  accountRepository: AccountRepository;
  holdingRepository: HoldingRepository;
  incomeRepository: IncomeSourceRepository;
};

export function InvestingPage({ accountRepository, holdingRepository, incomeRepository }: InvestingPageProps) {
  const [activeSectionId, setActiveSectionId] =
    useState<InvestingSectionId>('funding-schedule');

  const activeSection = useMemo(
    () =>
      investingSections.find((section) => section.id === activeSectionId) ??
      investingSections[0],
    [activeSectionId],
  );

  return (
    <section className="investing-shell">
      <header className="page-header compact-header">
        <div className="page-header-text">
          <h1>Investing</h1>
          <p>Track portfolio growth, holdings, and investment planning here.</p>
        </div>
      </header>

      <section className="toolbar" aria-label="Investing sections">
        <div className="filter-tabs" role="tablist" aria-label="Investing sections">
          {investingSections.map((section) => (
            <button
              aria-controls={`investing-panel-${section.id}`}
              aria-selected={section.id === activeSectionId}
              className="filter-tab"
              id={`investing-tab-${section.id}`}
              key={section.id}
              role="tab"
              type="button"
              onClick={() => setActiveSectionId(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </section>

      {activeSection.id === 'funding-schedule' ? (
        <section
          aria-labelledby={`investing-tab-${activeSection.id}`}
          id={`investing-panel-${activeSection.id}`}
          role="tabpanel"
        >
          <FundingSchedulePage
            accountRepository={accountRepository}
            incomeRepository={incomeRepository}
          />
        </section>
      ) : activeSection.id === 'holdings' ? (
        <section
          aria-labelledby={`investing-tab-${activeSection.id}`}
          id={`investing-panel-${activeSection.id}`}
          role="tabpanel"
        >
          <HoldingsPage
            accountRepository={accountRepository}
            holdingRepository={holdingRepository}
          />
        </section>
      ) : activeSection.id === 'passive-income' ? (
        <section
          aria-labelledby={`investing-tab-${activeSection.id}`}
          id={`investing-panel-${activeSection.id}`}
          role="tabpanel"
        >
          <PassiveIncomePage holdingRepository={holdingRepository} />
        </section>
      ) : (
        <section
          aria-labelledby={`investing-tab-${activeSection.id}`}
          className="empty-state"
          id={`investing-panel-${activeSection.id}`}
          role="tabpanel"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            show_chart
          </span>
          <h2>{activeSection.title}</h2>
          <p>{activeSection.description}</p>
        </section>
      )}
    </section>
  );
}
