import { useState } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import { SettingsMenu } from '../settings/SettingsMenu';
import { SettingsConfigurationPanel } from './SettingsConfigurationPanel';
import { SettingsBudgetPanel } from './SettingsBudgetPanel';

export type LandingPageProps = {
  repository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
};

export function LandingPage({ repository, budgetRepository }: LandingPageProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<'income' | 'budget'>(
    'income',
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
          ]}
          activeSectionId={activeSectionId}
          onActiveSectionChange={(nextId) =>
            setActiveSectionId(nextId === 'budget' ? 'budget' : 'income')
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

            return <SettingsConfigurationPanel repository={repository} />;
          }}
        />
      </div>
    </div>
  );
}
