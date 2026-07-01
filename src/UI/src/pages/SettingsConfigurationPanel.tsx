import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import { IncomeSourcesPage } from '../features/incomeSources/IncomeSourcesPage';

export type SettingsConfigurationPanelProps = {
  repository: IncomeSourceRepository;
};

export function SettingsConfigurationPanel({
  repository,
}: SettingsConfigurationPanelProps) {
  return (
    <div className="settings-configuration-panel">
      <IncomeSourcesPage
        repository={repository}
        layout="embedded"
        headerEyebrow="Configuration"
      />
    </div>
  );
}
