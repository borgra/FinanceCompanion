import { useState } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import { SettingsMenu } from '../settings/SettingsMenu';
import { SettingsConfigurationPanel } from './SettingsConfigurationPanel';

export type LandingPageProps = {
  repository: IncomeSourceRepository;
};

export function LandingPage({ repository }: LandingPageProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="landing-background">
      <div className="landing-container">
        <SettingsMenu
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          tabLabel="Configuration"
        >
          {isOpen ? <SettingsConfigurationPanel repository={repository} /> : null}
        </SettingsMenu>
      </div>
    </div>
  );
}
