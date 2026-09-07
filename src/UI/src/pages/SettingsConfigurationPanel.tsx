import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
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
  onNavigateToBanking?: () => void;
  initialTab?: ConfigurationTab;
};

type ConfigurationTab = 'budget' | 'banking' | 'investing' | 'net-worth';

const configurationTabs: Array<{ id: ConfigurationTab; label: string; icon: string }> = [
  { id: 'budget', label: 'Budget', icon: 'account_balance_wallet' },
  { id: 'banking', label: 'Banking', icon: 'account_balance' },
  { id: 'investing', label: 'Investing', icon: 'show_chart' },
  { id: 'net-worth', label: 'Net Worth', icon: 'savings' },
];

export function SettingsConfigurationPanel({ repository, holdingRepository, netWorthRepository, onMortgageTrackingSaved, onNavigateToBanking, initialTab = 'net-worth' }: SettingsConfigurationPanelProps) {
  const [activeTab, setActiveTab] = useState<ConfigurationTab>(initialTab);
  const hasLoadedNetWorth = useRef(false);
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

  useEffect(() => {
    if (activeTab !== 'net-worth' || hasLoadedNetWorth.current) return;
    hasLoadedNetWorth.current = true;
    void loadNetWorth();
  }, [activeTab, loadNetWorth]);

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
      const confirmedGoal = saved.netWorthGoal;
      if (confirmedGoal !== parsedGoal) {
        setMortgageVisibilityError('Net Worth Goal was not saved. Please try again.');
        return;
      }
      const savedTrackingState = saved.trackMortgageInNetWorth ?? trackMortgage;
      setTrackMortgage(savedTrackingState);
      setNetWorthGoal(confirmedGoal === 0 ? '' : String(confirmedGoal));
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

  const selectTabFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, tabId: ConfigurationTab) => {
    const currentIndex = configurationTabs.findIndex((tab) => tab.id === tabId);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? configurationTabs.length - 1 : event.key === 'ArrowRight' ? (currentIndex + 1) % configurationTabs.length : event.key === 'ArrowLeft' ? (currentIndex - 1 + configurationTabs.length) % configurationTabs.length : currentIndex;
    if (nextIndex === currentIndex && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const nextTab = configurationTabs[nextIndex];
    setActiveTab(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(`configuration-tab-${nextTab.id}`)?.focus());
  };

  return <main className="configuration-page" aria-labelledby="configuration-heading">
    <header className="page-header configuration-page-header">
      <div className="page-header-text">
        <p className="eyebrow">Financial setup</p>
        <h1 id="configuration-heading">Configuration</h1>
        <p>Set up the financial data and preferences that power your dashboard.</p>
      </div>
    </header>
    <div className="configuration-tabs" role="tablist" aria-label="Configuration areas">
      {configurationTabs.map((tab) => <button aria-controls={`configuration-panel-${tab.id}`} aria-selected={activeTab === tab.id} className="filter-tab configuration-tab" id={`configuration-tab-${tab.id}`} key={tab.id} role="tab" tabIndex={activeTab === tab.id ? 0 : -1} type="button" onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => selectTabFromKeyboard(event, tab.id)}><span className="material-symbols-outlined" aria-hidden="true">{tab.icon}</span>{tab.label}</button>)}
    </div>
    <section aria-labelledby={`configuration-tab-${activeTab}`} className="configuration-panel" id={`configuration-panel-${activeTab}`} role="tabpanel">
      {activeTab === 'budget' ? <IncomeSourcesPage repository={repository} layout="embedded" headerEyebrow="Budget configuration" /> : null}
      {activeTab === 'banking' ? <section className="configuration-card" aria-labelledby="banking-configuration-heading"><span className="material-symbols-outlined configuration-card-icon" aria-hidden="true">account_balance</span><h2 id="banking-configuration-heading">Banking account setup</h2><p>Manage account types, monthly projections, funding rules, and your emergency fund minimum in Banking.</p><button className="primary-action" type="button" onClick={onNavigateToBanking}>Manage banking accounts</button></section> : null}
      {activeTab === 'investing' ? <section className="configuration-card configuration-danger-card" aria-labelledby="investment-data-heading"><p className="eyebrow">Data maintenance</p><h2 id="investment-data-heading">Payment history</h2><p>Remove saved source and manual payment history from every holding. Your holdings and share quantities are kept; refreshing a holding can load source payments again.</p>{paymentDataError ? <p className="form-error" role="alert">{paymentDataError}</p> : null}{paymentDataMessage ? <p className="form-success" role="status">{paymentDataMessage}</p> : null}<button className="secondary-action danger-action" type="button" onClick={() => void purgePaymentData()} disabled={isPurgingPaymentData}>{isPurgingPaymentData ? 'Removing payment history...' : 'Remove payment history'}</button></section> : null}
      {activeTab === 'net-worth' ? <div className="configuration-card-grid">
        <section className="configuration-card" aria-labelledby="beginning-net-worth-heading"><h2 id="beginning-net-worth-heading">Baseline</h2><p>Set the starting value used by Net Worth to calculate variance.</p>{isLoadingNetWorth ? <p role="status">Loading beginning net worth...</p> : <><label className="field" htmlFor="beginning-net-worth-input"><span>Beginning Net Worth</span><input id="beginning-net-worth-input" type="text" inputMode="decimal" value={beginningNetWorth} aria-describedby="beginning-net-worth-help beginning-net-worth-message" aria-invalid={netWorthError ? true : undefined} onChange={(event) => { setBeginningNetWorth(event.target.value); setNetWorthError(null); setNetWorthStatus(null); }} /></label><p id="beginning-net-worth-help">Use a negative number when liabilities exceed assets.</p><div id="beginning-net-worth-message">{netWorthError ? <p className="form-error" role="alert">{netWorthError}</p> : null}{netWorthStatus ? <p className="form-success" role="status">{netWorthStatus}</p> : null}</div><div className="configuration-actions"><button className="primary-action" type="button" onClick={() => void saveNetWorth()} disabled={isSavingNetWorth}>{isSavingNetWorth ? 'Saving...' : 'Save beginning net worth'}</button>{netWorthError === 'Unable to load beginning net worth.' ? <button className="secondary-action" type="button" onClick={() => void loadNetWorth()}>Retry</button> : null}</div></>}</section>
        <section className="configuration-card" aria-labelledby="mortgage-visibility-heading"><h2 id="mortgage-visibility-heading">Goal &amp; tracking</h2><label className="configuration-checkbox"><input type="checkbox" checked={trackMortgage} onChange={(event) => { setTrackMortgage(event.target.checked); setMortgageVisibilityError(null); setMortgageVisibilityMessage(null); }} /> <span>Track Mortgage in Net Worth</span></label><p>Control whether mortgage data contributes to your Net Worth view.</p><label className="field" htmlFor="net-worth-goal-input"><span>Net Worth Goal</span><input id="net-worth-goal-input" type="text" inputMode="numeric" value={netWorthGoal} aria-describedby={`net-worth-goal-help${mortgageVisibilityError ? ' net-worth-configuration-message' : ''}`} aria-invalid={mortgageVisibilityError ? true : undefined} onChange={(event) => { setNetWorthGoal(event.target.value); setMortgageVisibilityError(null); setMortgageVisibilityMessage(null); }} /></label><p id="net-worth-goal-help">Optional nonnegative whole-number goal. Leave blank to hide the goal card.</p>{mortgageVisibilityError ? <p className="form-error" id="net-worth-configuration-message" role="alert">{mortgageVisibilityError}</p> : null}{mortgageVisibilityMessage ? <p className="form-success" role="status">{mortgageVisibilityMessage}</p> : null}<button className="primary-action" type="button" onClick={() => void saveMortgageVisibility()} disabled={isSavingMortgageVisibility}>{isSavingMortgageVisibility ? 'Saving...' : 'Save net worth configuration'}</button></section>
        <section className="configuration-card configuration-card-wide" aria-labelledby="mortgage-assumptions-heading"><h2 id="mortgage-assumptions-heading">Mortgage assumptions</h2><p>These values are saved separately from your goal and tracking preference.</p><div className="form-grid"><label className="field" htmlFor="mortgage-house-value-input"><span>House Value</span><div className="input-wrapper"><span className="input-prefix" aria-hidden="true">$</span><input id="mortgage-house-value-input" data-has-prefix="true" inputMode="decimal" aria-describedby={mortgageScheduleError ? 'mortgage-schedule-message' : undefined} aria-invalid={mortgageScheduleError ? true : undefined} value={houseValue} onChange={(event) => { setHouseValue(event.target.value); setMortgageScheduleError(null); setMortgageScheduleMessage(null); }} /></div></label><label className="field" htmlFor="mortgage-annual-interest-rate-input"><span>Annual Interest Rate</span><input id="mortgage-annual-interest-rate-input" inputMode="decimal" aria-describedby={mortgageScheduleError ? 'mortgage-schedule-message' : undefined} aria-invalid={mortgageScheduleError ? true : undefined} value={annualInterestRate} onChange={(event) => { setAnnualInterestRate(event.target.value); setMortgageScheduleError(null); setMortgageScheduleMessage(null); }} /><small>Use decimal format: 0.02875 = 2.875%.</small></label></div>{mortgageScheduleError ? <p className="form-error" id="mortgage-schedule-message" role="alert">{mortgageScheduleError}</p> : null}{mortgageScheduleMessage ? <p className="form-success" role="status">{mortgageScheduleMessage}</p> : null}<div className="configuration-actions"><button className="secondary-action" type="button" onClick={() => void saveMortgageAssumptions()} disabled={isSavingMortgageSchedule}>{isSavingMortgageSchedule ? 'Saving mortgage assumptions...' : 'Save mortgage assumptions'}</button><button className="secondary-action danger-action" type="button" onClick={() => void deleteMortgageSchedule()} disabled={isDeletingMortgageSchedule}>{isDeletingMortgageSchedule ? 'Removing mortgage schedule...' : 'Delete mortgage schedule'}</button></div></section>
      </div> : null}
    </section>
    {configurationTabs.filter((tab) => tab.id !== activeTab).map((tab) => <section aria-labelledby={`configuration-tab-${tab.id}`} hidden id={`configuration-panel-${tab.id}`} key={tab.id} role="tabpanel" />)}
  </main>;
}
