import { useCallback, useEffect, useState } from 'react';
import type { HoldingRepository } from '../domain/holdingRepository';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { MortgageSchedule } from '../domain/netWorth';
import type { NetWorthRepository } from '../domain/netWorthRepository';
import { IncomeSourcesPage } from '../features/incomeSources/IncomeSourcesPage';

export type SettingsConfigurationPanelProps = {
  repository: IncomeSourceRepository;
  holdingRepository: HoldingRepository;
  netWorthRepository: Pick<NetWorthRepository, 'get' | 'put' | 'putConfiguration' | 'putMortgageSchedule' | 'deleteMortgageSchedule'>;
  onMortgageTrackingSaved?: (isEnabled: boolean) => void;
};

export function SettingsConfigurationPanel({ repository, holdingRepository, netWorthRepository, onMortgageTrackingSaved }: SettingsConfigurationPanelProps) {
  const [beginningNetWorth, setBeginningNetWorth] = useState('');
  const [trackMortgage, setTrackMortgage] = useState(false);
  const [netWorthGoal, setNetWorthGoal] = useState('');
  const [houseValue, setHouseValue] = useState('800000');
  const [annualInterestRate, setAnnualInterestRate] = useState('0.02875');
  const [savedMortgageSchedule, setSavedMortgageSchedule] = useState<MortgageSchedule | null>(null);
  const [isLoadingNetWorth, setIsLoadingNetWorth] = useState(true);
  const [isSavingNetWorth, setIsSavingNetWorth] = useState(false);
  const [isSavingMortgageVisibility, setIsSavingMortgageVisibility] = useState(false);
  const [isSavingMortgageSchedule, setIsSavingMortgageSchedule] = useState(false);
  const [isDeletingMortgageSchedule, setIsDeletingMortgageSchedule] = useState(false);
  const [mortgageVisibilityMessage, setMortgageVisibilityMessage] = useState<string | null>(null);
  const [mortgageVisibilityError, setMortgageVisibilityError] = useState<string | null>(null);
  const [mortgageScheduleMessage, setMortgageScheduleMessage] = useState<string | null>(null);
  const [mortgageScheduleError, setMortgageScheduleError] = useState<string | null>(null);
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
      setTrackMortgage(value?.trackMortgageInNetWorth ?? true);
      setNetWorthGoal(value?.netWorthGoal == null || value.netWorthGoal === 0 ? '' : String(value.netWorthGoal));
      setHouseValue(String(value?.mortgageSchedule?.houseValue ?? 800000));
      setAnnualInterestRate(String(value?.mortgageSchedule?.annualInterestRate ?? 0.02875));
      setSavedMortgageSchedule(value?.mortgageSchedule ?? null);
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
    const trimmedGoal = netWorthGoal.trim();
    const parsedGoal = trimmedGoal === '' ? 0 : Number(trimmedGoal);
    if (!Number.isSafeInteger(parsedGoal) || parsedGoal < 0) {
      setMortgageVisibilityError('Enter a nonnegative whole number for the net worth goal, or leave it blank.');
      setMortgageVisibilityMessage(null);
      return;
    }
    setIsSavingMortgageVisibility(true);
    setMortgageVisibilityError(null);
    setMortgageVisibilityMessage(null);
    try {
      const saved = await netWorthRepository.putConfiguration({ trackMortgageInNetWorth: trackMortgage, netWorthGoal: parsedGoal });
      if (saved.netWorthGoal !== undefined && saved.netWorthGoal !== parsedGoal) {
        setMortgageVisibilityError('Net Worth Goal was not saved. Please try again.');
        return;
      }
      const savedTrackingState = saved.trackMortgageInNetWorth ?? trackMortgage;
      setTrackMortgage(savedTrackingState);
      const persistedGoal = saved.netWorthGoal ?? parsedGoal;
      setNetWorthGoal(persistedGoal === 0 ? '' : String(persistedGoal));
      onMortgageTrackingSaved?.(savedTrackingState);
      setMortgageVisibilityMessage('Net worth configuration saved.');
    } catch {
      setMortgageVisibilityError('Unable to save net worth configuration.');
    } finally {
      setIsSavingMortgageVisibility(false);
    }
  };

  const saveMortgageAssumptions = async () => {
    if (!netWorthRepository.putMortgageSchedule) {
      setMortgageScheduleError('Mortgage schedule persistence is unavailable.');
      setMortgageScheduleMessage(null);
      return;
    }
    const parsedHouseValue = Number(houseValue);
    const parsedAnnualInterestRate = Number(annualInterestRate);
    if (![parsedHouseValue, parsedAnnualInterestRate].every((value) => Number.isFinite(value) && value >= 0)) {
      setMortgageScheduleError('Enter finite, nonnegative values for the home value and annual interest rate.');
      setMortgageScheduleMessage(null);
      return;
    }
    setIsSavingMortgageSchedule(true);
    setMortgageScheduleError(null);
    setMortgageScheduleMessage(null);
    const existing = savedMortgageSchedule;
    const schedule: MortgageSchedule = {
      houseValue: parsedHouseValue,
      annualInterestRate: parsedAnnualInterestRate,
      startingOutstandingMortgage: existing?.startingOutstandingMortgage ?? 0,
      monthlyPrincipalPayment: existing?.monthlyPrincipalPayment ?? 0,
      monthlyAdditionalPrincipalPayment: existing?.monthlyAdditionalPrincipalPayment ?? 0,
      scheduleStartMonth: existing?.scheduleStartMonth ?? '2026-01',
      principalOverrides: existing?.principalOverrides,
      extraPrincipalOverrides: existing?.extraPrincipalOverrides,
    };
    try {
      const saved = await netWorthRepository.putMortgageSchedule(schedule);
      const savedSchedule = saved.mortgageSchedule ?? schedule;
      setSavedMortgageSchedule(savedSchedule);
      setHouseValue(String(savedSchedule.houseValue));
      setAnnualInterestRate(String(savedSchedule.annualInterestRate));
      setMortgageScheduleMessage('Mortgage assumptions saved.');
    } catch {
      setMortgageScheduleError('Unable to save mortgage assumptions.');
    } finally {
      setIsSavingMortgageSchedule(false);
    }
  };

  const deleteMortgageSchedule = async () => {
    if (!netWorthRepository.deleteMortgageSchedule) { setMortgageScheduleError('Mortgage schedule deletion is unavailable.'); return; }
    if (!window.confirm('Clear all saved Mortgage Schedule values and overrides? Mortgage Configuration values will be kept.')) return;
    setIsDeletingMortgageSchedule(true); setMortgageScheduleError(null); setMortgageScheduleMessage(null);
    try {
      const saved = await netWorthRepository.deleteMortgageSchedule();
      setSavedMortgageSchedule(saved.mortgageSchedule ?? null);
      setHouseValue(String(saved.mortgageSchedule?.houseValue ?? houseValue)); setAnnualInterestRate(String(saved.mortgageSchedule?.annualInterestRate ?? annualInterestRate));
      setMortgageScheduleMessage('Mortgage schedule cleared. Mortgage configuration was kept.');
    } catch {
      setMortgageScheduleError('Unable to delete mortgage schedule.');
    } finally {
      setIsDeletingMortgageSchedule(false);
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
      <h2 id="mortgage-visibility-heading">Net Worth</h2><label><input type="checkbox" checked={trackMortgage} onChange={(event) => { setTrackMortgage(event.target.checked); setMortgageVisibilityError(null); setMortgageVisibilityMessage(null); }} /> Track Mortgage in Net Worth</label><p>Controls Mortgage Schedule visibility.</p><label htmlFor="net-worth-goal-input" style={{ display: 'block', fontWeight: 600 }}>Net Worth Goal</label><input id="net-worth-goal-input" type="text" inputMode="numeric" value={netWorthGoal} aria-describedby="net-worth-goal-help" aria-invalid={mortgageVisibilityError ? true : undefined} onChange={(event) => { setNetWorthGoal(event.target.value); setMortgageVisibilityError(null); setMortgageVisibilityMessage(null); }} style={{ marginTop: 8, width: 'min(280px, 100%)', border: '1px solid var(--md-sys-color-outline)', borderRadius: '12px', padding: '10px 12px', background: 'var(--md-sys-color-surface-container)' }} /><p id="net-worth-goal-help">Optional nonnegative whole-number goal. Leave blank to hide the goal card.</p>{mortgageVisibilityError ? <p className="form-error" role="alert">{mortgageVisibilityError}</p> : null}{mortgageVisibilityMessage ? <p className="form-success" role="status">{mortgageVisibilityMessage}</p> : null}<button className="primary-action" type="button" onClick={() => void saveMortgageVisibility()} disabled={isSavingMortgageVisibility}>{isSavingMortgageVisibility ? 'Saving...' : 'Save net worth configuration'}</button><h3>Mortgage assumptions</h3><p>These values are saved separately from Net Worth tracking and Goal configuration.</p><div className="form-grid"><label className="field" htmlFor="mortgage-house-value-input"><span>House Value</span><div className="input-wrapper"><span className="input-prefix">$</span><input id="mortgage-house-value-input" data-has-prefix="true" inputMode="decimal" value={houseValue} onChange={(event) => { setHouseValue(event.target.value); setMortgageScheduleError(null); setMortgageScheduleMessage(null); }} /></div></label><label className="field" htmlFor="mortgage-annual-interest-rate-input"><span>Annual Interest Rate</span><input id="mortgage-annual-interest-rate-input" inputMode="decimal" value={annualInterestRate} onChange={(event) => { setAnnualInterestRate(event.target.value); setMortgageScheduleError(null); setMortgageScheduleMessage(null); }} /><small>Use decimal format: 0.02875 = 2.875%.</small></label></div>{mortgageScheduleError ? <p className="form-error" role="alert">{mortgageScheduleError}</p> : null}{mortgageScheduleMessage ? <p className="form-success" role="status">{mortgageScheduleMessage}</p> : null}<button className="secondary-action" type="button" onClick={() => void saveMortgageAssumptions()} disabled={isSavingMortgageSchedule}>{isSavingMortgageSchedule ? 'Saving mortgage assumptions...' : 'Save mortgage assumptions'}</button><button className="secondary-action" type="button" onClick={() => void deleteMortgageSchedule()} disabled={isDeletingMortgageSchedule}>{isDeletingMortgageSchedule ? 'Deleting mortgage schedule...' : 'Delete mortgage schedule'}</button>
    </section>    <section aria-labelledby="holding-payment-data-heading" style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '16px', background: 'var(--md-sys-color-surface)', padding: '16px' }}>
      <h2 id="holding-payment-data-heading" style={{ marginBottom: 4 }}>Holdings</h2><p style={{ marginBottom: 12 }}>Remove all saved source and manual payment data. Your holdings and share quantities are kept. Refreshing a holding can load source payments again.</p>
      {paymentDataError ? <p className="form-error" role="alert">{paymentDataError}</p> : null}{paymentDataMessage ? <p className="form-success" role="status">{paymentDataMessage}</p> : null}
      <button className="secondary-action" type="button" onClick={() => void purgePaymentData()} disabled={isPurgingPaymentData}>{isPurgingPaymentData ? 'Removing payment data...' : 'Purge all payment data'}</button>
    </section>
    <IncomeSourcesPage repository={repository} layout="embedded" headerEyebrow="Configuration" />
  </div>;
}







