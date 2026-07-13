import { useState } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import type { AccountRepository } from '../domain/accountRepository';
import type { HoldingRepository } from '../domain/holdingRepository';
import { SettingsMenu } from '../settings/SettingsMenu';
import { SettingsConfigurationPanel } from './SettingsConfigurationPanel';
import { SettingsBudgetPanel } from './SettingsBudgetPanel';
import { AccountPage } from './AccountPage';
import { InvestingPage } from './InvestingPage';
import { NetWorthPage } from './NetWorthPage';

export type LandingPageProps = {
  repository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
  accountRepository: AccountRepository;
  holdingRepository: HoldingRepository;
};

export function LandingPage({ repository, budgetRepository, accountRepository, holdingRepository }: LandingPageProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeSectionId, setActiveSectionId] =
    useState<'income' | 'budget' | 'accounts' | 'investing' | 'net-worth'>('budget');

  return (
    <div className="landing-background">
      <div className="landing-container">
        <SettingsMenu
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          sections={[
            { id: 'income', label: 'Configuration', icon: 'tune' },
            { id: 'budget', label: 'Budget', icon: 'account_balance_wallet' },
            { id: 'accounts', label: 'Banking', icon: 'account_balance' },
            { id: 'investing', label: 'Investing', icon: 'show_chart' },
            { id: 'net-worth', label: 'Net Worth', icon: 'savings' },
          ]}
          activeSectionId={activeSectionId}
          onActiveSectionChange={(nextId) =>
            setActiveSectionId(nextId as 'income' | 'budget' | 'accounts' | 'investing' | 'net-worth')
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
            if (activeId === 'investing') {
              return (
                <InvestingPage
                  accountRepository={accountRepository}
                  holdingRepository={holdingRepository}
                  incomeRepository={repository}
                />
              );
            }
            if (activeId === 'net-worth') {
              return (
                <NetWorthPage
                  accountRepository={accountRepository}
                  incomeRepository={repository}
                  holdingRepository={holdingRepository}
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
