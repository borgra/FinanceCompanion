import { useState } from 'react';
import type { HoldingRepository } from '../domain/holdingRepository';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import { IncomeSourcesPage } from '../features/incomeSources/IncomeSourcesPage';
import { readBeginningNetWorth, writeBeginningNetWorth } from '../domain/netWorthConfiguration';

export type SettingsConfigurationPanelProps = {
  repository: IncomeSourceRepository;
  holdingRepository: HoldingRepository;
};

export function SettingsConfigurationPanel({
  repository,
  holdingRepository,
}: SettingsConfigurationPanelProps) {
  const [beginningNetWorth, setBeginningNetWorth] = useState(() => {
    const storedValue = readBeginningNetWorth();
    return storedValue === undefined ? '' : String(storedValue);
  });
  const [isPurgingPaymentData, setIsPurgingPaymentData] = useState(false);
  const [paymentDataMessage, setPaymentDataMessage] = useState<string | null>(null);
  const [paymentDataError, setPaymentDataError] = useState<string | null>(null);

  const purgePaymentData = async () => {
    if (!holdingRepository.purgePaymentData) {
      setPaymentDataError('Payment data purge is unavailable.');
      return;
    }
    if (!window.confirm('Remove all saved source and manual payment data for every holding? Holdings and quantities will not be changed.')) {
      return;
    }
    setIsPurgingPaymentData(true);
    setPaymentDataError(null);
    setPaymentDataMessage(null);
    try {
      const updatedHoldings = await holdingRepository.purgePaymentData();
      setPaymentDataMessage(`Payment data was removed from ${updatedHoldings.length} holdings.`);
    } catch {
      setPaymentDataError('Unable to remove payment data.');
    } finally {
      setIsPurgingPaymentData(false);
    }
  };

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
        <h2 id="beginning-net-worth-heading" style={{ marginBottom: 4 }}>Beginning Net Worth</h2>
        <p style={{ marginBottom: 12 }}>Set the baseline value used by the Net Worth tab to calculate variance.</p>
        <label htmlFor="beginning-net-worth-input" style={{ display: 'block', fontWeight: 600 }}>Beginning Net Worth</label>
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
            if (Number.isFinite(parsedValue)) writeBeginningNetWorth(parsedValue);
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

      <section
        aria-labelledby="holding-payment-data-heading"
        style={{
          border: '1px solid var(--md-sys-color-outline-variant)',
          borderRadius: '16px',
          background: 'var(--md-sys-color-surface)',
          padding: '16px',
        }}
      >
        <h2 id="holding-payment-data-heading" style={{ marginBottom: 4 }}>Holdings</h2>
        <p style={{ marginBottom: 12 }}>
          Remove all saved source and manual payment data. Your holdings and share quantities are kept. Refreshing a holding can load source payments again.
        </p>
        {paymentDataError ? <p className="form-error" role="alert">{paymentDataError}</p> : null}
        {paymentDataMessage ? <p className="form-success" role="status">{paymentDataMessage}</p> : null}
        <button className="secondary-action" type="button" onClick={() => void purgePaymentData()} disabled={isPurgingPaymentData}>
          {isPurgingPaymentData ? 'Removing payment data...' : 'Purge all payment data'}
        </button>
      </section>

      <IncomeSourcesPage repository={repository} layout="embedded" headerEyebrow="Configuration" />
    </div>
  );
}