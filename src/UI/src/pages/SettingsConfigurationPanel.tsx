import { useState } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import { IncomeSourcesPage } from '../features/incomeSources/IncomeSourcesPage';
import { readBeginningNetWorth, writeBeginningNetWorth } from '../domain/netWorthConfiguration';

export type SettingsConfigurationPanelProps = {
  repository: IncomeSourceRepository;
};

export function SettingsConfigurationPanel({
  repository,
}: SettingsConfigurationPanelProps) {
  const [beginningNetWorth, setBeginningNetWorth] = useState(() => {
    const storedValue = readBeginningNetWorth();
    return storedValue === undefined ? '' : String(storedValue);
  });

  return (
    <div className="settings-configuration-panel" style={{ display: 'grid', gap: '24px' }}>
      <section
        aria-labelledby="beginning-net-worth-heading"
        style={{
          border: '1px solid var(--md-sys-color-outline-variant)',
          borderRadius: '16px',
          background: 'var(--md-sys-color-surface)',
          padding: '16px',
        }}
      >
        <h2 id="beginning-net-worth-heading" style={{ marginBottom: 4 }}>
          Beginning Net Worth
        </h2>
        <p style={{ marginBottom: 12 }}>Set the baseline value used by the Net Worth tab to calculate variance.</p>
        <label htmlFor="beginning-net-worth-input" style={{ display: 'block', fontWeight: 600 }}>
          Beginning Net Worth
        </label>
        <input
          id="beginning-net-worth-input"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={beginningNetWorth}
          onChange={(event) => {
            const nextValue = event.target.value;
            setBeginningNetWorth(nextValue);
            if (nextValue.trim() === '') {
              writeBeginningNetWorth(undefined);
              return;
            }

            const parsedValue = Number(nextValue);
            if (Number.isFinite(parsedValue)) {
              writeBeginningNetWorth(parsedValue);
            }
          }}
          style={{
            marginTop: 8,
            width: 'min(280px, 100%)',
            border: '1px solid var(--md-sys-color-outline)',
            borderRadius: '12px',
            padding: '10px 12px',
            background: 'var(--md-sys-color-surface-container)',
          }}
        />
      </section>

      <IncomeSourcesPage
        repository={repository}
        layout="embedded"
        headerEyebrow="Configuration"
      />
    </div>
  );
}
