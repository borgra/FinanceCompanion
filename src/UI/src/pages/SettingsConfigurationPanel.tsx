import { useCallback, useEffect, useState } from 'react';
import type { HoldingRepository } from '../domain/holdingRepository';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { NetWorthRepository } from '../domain/netWorthRepository';
import { IncomeSourcesPage } from '../features/incomeSources/IncomeSourcesPage';

export type SettingsConfigurationPanelProps = {
  repository: IncomeSourceRepository;
  holdingRepository: HoldingRepository;
  netWorthRepository: Pick<NetWorthRepository, 'get' | 'put' | 'putConfiguration'>;
};

export function SettingsConfigurationPanel({ repository, holdingRepository, netWorthRepository }: SettingsConfigurationPanelProps) {
  const [beginningNetWorth, setBeginningNetWorth] = useState('');
  const [trackMortgage, setTrackMortgage] = useState(false);
  const [isLoadingNetWorth, setIsLoadingNetWorth] = useState(true);
  const [isSavingNetWorth, setIsSavingNetWorth] = useState(false);
  const [isSavingMortgageVisibility, setIsSavingMortgageVisibility] = useState(false);
  const [mortgageVisibilityMessage, setMortgageVisibilityMessage] = useState<string | null>(null);
  const [mortgageVisibilityError, setMortgageVisibilityError] = useState<string | null>(null);
  const [netWorthError, setNetWorthError] = useState<string | null>(null);
  const [netWorthStatus, setNetWorthStatus] = useState<string | null>(null);
  const [isPurgingPaymentData, setIsPurgingPaymentData] = useState(false);
  const [paymentDataMessage, setPaymentDataMessage] = useState<string | null>(null);
  const [paymentDataError, setPaymentDataError] = useState<string | null>(null);

  const loadNetWorth = useCallback(async () => {
    setIsLoadingNetWorth(true);
    setNetWorthError(null);
    try {
      const value = await netWorthRepository.get();
      setBeginningNetWorth(value === undefined ? '' : String(value.beginningNetWorth ?? ''));
      setTrackMortgage(value?.trackMortgageInNetWorth ?? false);
    } catch {
      setNetWorthError('Unable to load beginning net worth.');
    } finally {
      setIsLoadingNetWorth(false);
    }
  }, [netWorthRepository]);

  useEffect(() => { void loadNetWorth(); }, [loadNetWorth]);

  const saveNetWorth = async () => {
    const parsedValue = Number(beginningNetWorth);
    if (beginningNetWorth.trim() === '' || !Number.isFinite(parsedValue)) {
      setNetWorthError('Enter a valid number for beginning net worth.');
      setNetWorthStatus(null);
      return;
    }
    setIsSavingNetWorth(true);
    setNetWorthError(null);
    setNetWorthStatus(null);
    try {
      const saved = await netWorthRepository.put(parsedValue);
      setBeginningNetWorth(String(saved.beginningNetWorth));
      setNetWorthStatus('Beginning net worth saved.');
    } catch {
      setNetWorthError('Unable to save beginning net worth.');
    } finally {
      setIsSavingNetWorth(false);
    }
  };

  const saveMortgageVisibility = async () => {
    if (!netWorthRepository.putConfiguration) {
      setMortgageVisibilityError('Mortgage tracking configuration is unavailable.');
      return;
    }
    setIsSavingMortgageVisibility(true);
    setMortgageVisibilityError(null);
    setMortgageVisibilityMessage(null);
    try {
      const saved = await netWorthRepository.putConfiguration(trackMortgage);
      setTrackMortgage(saved.trackMortgageInNetWorth ?? trackMortgage);
      setMortgageVisibilityMessage('Mortgage tracking configuration saved.');
    } catch {
      setMortgageVisibilityError('Unable to save mortgage tracking configuration.');
    } finally {
      setIsSavingMortgageVisibility(false);
    }
  };

  const purgePaymentData = async () => {
    if (!holdingRepository.purgePaymentData) { setPaymentDataError('Payment data purge is unavailable.'); return; }
    if (!window.confirm('Remove all saved source and manual payment data for every holding? Holdings and quantities will not be changed.')) return;
    setIsPurgingPaymentData(true); setPaymentDataError(null); setPaymentDataMessage(null);
    try { const updated = await holdingRepository.purgePaymentData(); setPaymentDataMessage(`Payment data was removed from ${updated.length} holdings.`); }
    catch { setPaymentDataError('Unable to remove payment data.'); }
    finally { setIsPurgingPaymentData(false); }
  };

  return <div className="settings-configuration-panel" style={{ display: 'grid', gap: '24px' }}>
    <section aria-labelledby="beginning-net-worth-heading" style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '16px', background: 'var(--md-sys-color-surface)', padding: '16px' }}>
      <h2 id="beginning-net-worth-heading" style={{ marginBottom: 4 }}>Beginning Net Worth</h2>
      <p style={{ marginBottom: 12 }}>Set the baseline value used by the Net Worth tab to calculate variance.</p>
      {isLoadingNetWorth ? <p role="status">Loading beginning net worth...</p> : <>
        <label htmlFor="beginning-net-worth-input" style={{ display: 'block', fontWeight: 600 }}>Beginning Net Worth</label>
        <input id="beginning-net-worth-input" type="text" inputMode="decimal" value={beginningNetWorth} aria-describedby="beginning-net-worth-help beginning-net-worth-message" aria-invalid={netWorthError ? true : undefined} onChange={(event) => { setBeginningNetWorth(event.target.value); setNetWorthError(null); setNetWorthStatus(null); }} style={{ marginTop: 8, width: 'min(280px, 100%)', border: '1px solid var(--md-sys-color-outline)', borderRadius: '12px', padding: '10px 12px', background: 'var(--md-sys-color-surface-container)' }} />
        <p id="beginning-net-worth-help">Use a negative number when liabilities exceed assets.</p>
        <div id="beginning-net-worth-message">{netWorthError ? <p className="form-error" role="alert">{netWorthError}</p> : null}{netWorthStatus ? <p className="form-success" role="status">{netWorthStatus}</p> : null}</div>
        <button className="primary-action" type="button" onClick={() => void saveNetWorth()} disabled={isSavingNetWorth}>{isSavingNetWorth ? 'Saving...' : 'Save beginning net worth'}</button>
        {netWorthError === 'Unable to load beginning net worth.' ? <button className="secondary-action" type="button" onClick={() => void loadNetWorth()}>Retry</button> : null}
      </>}
    </section>
    <section aria-labelledby="mortgage-visibility-heading" style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '16px', background: 'var(--md-sys-color-surface)', padding: '16px' }}>
      <h2 id="mortgage-visibility-heading">Net Worth</h2><label><input type="checkbox" checked={trackMortgage} onChange={(event) => { setTrackMortgage(event.target.checked); setMortgageVisibilityError(null); setMortgageVisibilityMessage(null); }} /> Track Mortgage in Net Worth</label><p>This setting only controls whether the Mortgage Schedule tab is visible.</p>{mortgageVisibilityError ? <p className="form-error" role="alert">{mortgageVisibilityError}</p> : null}{mortgageVisibilityMessage ? <p className="form-success" role="status">{mortgageVisibilityMessage}</p> : null}<button className="primary-action" type="button" onClick={() => void saveMortgageVisibility()} disabled={isSavingMortgageVisibility}>{isSavingMortgageVisibility ? 'Saving...' : 'Save net worth configuration'}</button>
    </section>    <section aria-labelledby="holding-payment-data-heading" style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '16px', background: 'var(--md-sys-color-surface)', padding: '16px' }}>
      <h2 id="holding-payment-data-heading" style={{ marginBottom: 4 }}>Holdings</h2><p style={{ marginBottom: 12 }}>Remove all saved source and manual payment data. Your holdings and share quantities are kept. Refreshing a holding can load source payments again.</p>
      {paymentDataError ? <p className="form-error" role="alert">{paymentDataError}</p> : null}{paymentDataMessage ? <p className="form-success" role="status">{paymentDataMessage}</p> : null}
      <button className="secondary-action" type="button" onClick={() => void purgePaymentData()} disabled={isPurgingPaymentData}>{isPurgingPaymentData ? 'Removing payment data...' : 'Purge all payment data'}</button>
    </section>
    <IncomeSourcesPage repository={repository} layout="embedded" headerEyebrow="Configuration" />
  </div>;
}



