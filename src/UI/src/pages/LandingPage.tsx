import { useState } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import { SettingsMenu } from '../settings/SettingsMenu';
import { SettingsConfigurationPanel } from './SettingsConfigurationPanel';

export type LandingPageProps = {
  repository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
};

export function LandingPage({ repository, budgetRepository }: LandingPageProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="landing-background">
      <div className="landing-container">
        <SettingsMenu
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          tabLabel="Configuration"
        >
          {isOpen ? (
            <SettingsConfigurationPanel
              repository={repository}
              budgetRepository={budgetRepository}
            />
          ) : null}
        </SettingsMenu>
      </div>
    </div>
  );
}
