import { useState } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import type { AccountRepository } from '../domain/accountRepository';
import { SettingsMenu } from '../settings/SettingsMenu';
import { SettingsConfigurationPanel } from './SettingsConfigurationPanel';
import { SettingsBudgetPanel } from './SettingsBudgetPanel';
import { AccountPage } from './AccountPage';

export type LandingPageProps = {
  repository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
  accountRepository: AccountRepository;
};

export function LandingPage({ repository, budgetRepository, accountRepository }: LandingPageProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState<'income' | 'budget' | 'accounts'>(
    'budget',
  );

  return (
    <div className="landing-background">
      <div className="landing-container">
        <SettingsMenu
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          sections={[
            { id: 'income', label: 'Configuration' },
            { id: 'budget', label: 'Budget' },
            { id: 'accounts', label: 'Accounts' },
          ]}
          activeSectionId={activeSectionId}
          onActiveSectionChange={(nextId) =>
            setActiveSectionId(nextId as 'income' | 'budget' | 'accounts')
          }
          getPanel={(activeId) => {
            if (activeId === 'budget') {
              return (
                <SettingsBudgetPanel
                  incomeRepository={repository}
                  budgetRepository={budgetRepository}
                />
              );
            }
            if (activeId === 'accounts') {
              return (
                <AccountPage
                  incomeRepository={repository}
                  budgetRepository={budgetRepository}
                  accountRepository={accountRepository}
                />
              );
            }

            return <SettingsConfigurationPanel repository={repository} />;
          }}
        />
      </div>
    </div>
  );
}
