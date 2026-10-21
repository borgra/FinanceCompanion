import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { CorporateAction, SecurityDetailsProvenance, SecurityMetadata, SecurityPayoutDetails } from '../domain/holding';

type SecurityDetailsDialogProps = {
  security: SecurityMetadata;
  manageDividends?: boolean;
  onClose: () => void;
  onSaveCorporateActions: (actions: CorporateAction[]) => Promise<void>;
  onSaveDividendSettings: (dividendGrowthRate: number | null, manageDividends: boolean) => Promise<void>;
  onRemovePayments?: () => Promise<void>;
};

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 });

const formatOptional = (value: number | null | undefined, formatter = numberFormatter) =>
  value == null ? 'Not available' : formatter.format(value);

const cloneActions = (actions: CorporateAction[] = []) => actions.map((action) => ({ ...action }));
const toPercentDraft = (value: number | null | undefined) => value == null ? '' : String(value * 100);

const distributionStatus = (payout: SecurityPayoutDetails) =>
  payout.status === 'projected' ? 'Projected' : payout.status === 'announced' ? 'Announced' : 'Actual';

const distributionAmount = (payout: SecurityPayoutDetails, currency: string) => {
  const amount = payout.amountPerShare == null ? payout.amount : Number(payout.amountPerShare);
  if (!Number.isFinite(amount)) return 'Not available';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: payout.currency || currency, maximumFractionDigits: 8,
  }).format(amount);
};

const sourceLink = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      && host.includes('.') && !host.endsWith('.local') && !host.endsWith('.localhost')
      && !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
      ? url.href : null;
  } catch {
    return null;
  }
};

const detailFields: Array<{ key: keyof SecurityMetadata; field: SecurityDetailsProvenance['fieldEvidence'][number]['field']; label: string; formatter?: Intl.NumberFormat }> = [
  { key: 'price', field: 'price', label: 'Price', formatter: currencyFormatter },
  { key: 'sector', field: 'sector', label: 'Sector' },
  { key: 'industry', field: 'industry', label: 'Industry' },
  { key: 'peRatio', field: 'pe_ratio', label: 'P/E ratio' },
  { key: 'thirtyDayYield', field: 'thirty_day_yield', label: '30-day SEC yield', formatter: percentFormatter },
  { key: 'fiftyTwoWeekLow', field: 'fifty_two_week_low', label: '52-week low', formatter: currencyFormatter },
  { key: 'fiftyTwoWeekHigh', field: 'fifty_two_week_high', label: '52-week high', formatter: currencyFormatter },
  { key: 'sma20', field: 'sma20', label: '20-session SMA', formatter: currencyFormatter },
  { key: 'sma50', field: 'sma50', label: '50-session SMA', formatter: currencyFormatter },
  { key: 'sma200', field: 'sma200', label: '200-session SMA', formatter: currencyFormatter },
];

const isValidAction = (action: CorporateAction) =>
  Boolean(action.effectiveDate) && action.oldShares > 0 && action.newShares > 0 && action.oldShares !== action.newShares &&
  (action.type === 'stock_split' ? action.newShares > action.oldShares : action.newShares < action.oldShares);

export function SecurityDetailsDialog({ security, manageDividends = true, onClose, onSaveCorporateActions, onSaveDividendSettings, onRemovePayments }: SecurityDetailsDialogProps) {
  // Legacy and offline API responses may serialize missing provenance as {}.
  const detailsProvenance = security.detailsProvenance && Array.isArray(security.detailsProvenance.sources)
    && Array.isArray(security.detailsProvenance.fieldEvidence) && Array.isArray(security.detailsProvenance.warnings)
    && typeof security.detailsProvenance.retrievedAt === 'string' ? security.detailsProvenance : null;
  const [activeTab, setActiveTab] = useState<'details' | 'actions'>('details');
  const [actionDrafts, setActionDrafts] = useState(() => cloneActions(security.corporateActions));
  const [isSavingActions, setIsSavingActions] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [dividendGrowthRateDraft, setDividendGrowthRateDraft] = useState(() => toPercentDraft(security.dividendGrowthRate));
  const [manageDividendsDraft, setManageDividendsDraft] = useState(manageDividends);
  const [dividendGrowthRateBadInput, setDividendGrowthRateBadInput] = useState(false);
  const [isSavingDividendSettings, setIsSavingDividendSettings] = useState(false);
  const [dividendGrowthRateError, setDividendGrowthRateError] = useState<string | null>(null);
  const [dividendSettingsError, setDividendSettingsError] = useState<string | null>(null);
  const [dividendSettingsSaved, setDividendSettingsSaved] = useState(false);
  const [isRemovingPayments, setIsRemovingPayments] = useState(false);
  const [removePaymentsError, setRemovePaymentsError] = useState<string | null>(null);
  const [paymentsRemoved, setPaymentsRemoved] = useState(false);
  const mutationPending = useRef(false);
  const isMutationPending = isSavingActions || isSavingDividendSettings || isRemovingPayments;
  const hasSavedPayments = [security.payoutDetails, security.sourcePayoutDetails, security.manualPayoutDetails, security.payoutAuditDetails]
    .some((payments) => Boolean(payments?.length)) || Object.entries(security).some(([key, value]) =>
      (key.startsWith('dividendResearch') || ['dividendPreviousYear', 'dividendCurrentYear', 'estimatedFuturePayout', 'dividendStatus'].includes(key))
      && value != null && value !== '' && (typeof value !== 'object' || Object.keys(value).length > 0));
  const savedActions = useMemo(() => cloneActions(security.corporateActions), [security.corporateActions]);
  const savedDividendGrowthRateDraft = useMemo(() => toPercentDraft(security.dividendGrowthRate), [security.dividendGrowthRate]);
  const distributions = useMemo(() => (security.payoutDetails ?? [])
    .filter((payout) => payout.status !== 'superseded')
    .sort((left, right) => right.exDividendDate.localeCompare(left.exDividendDate)), [security.payoutDetails]);

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? []);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); trigger?.focus(); };
  }, [onClose]);

  const actionsChanged = JSON.stringify(actionDrafts) !== JSON.stringify(savedActions);
  const dividendSettingsChanged = dividendGrowthRateDraft !== savedDividendGrowthRateDraft || manageDividendsDraft !== manageDividends;
  const updateAction = (id: string, patch: Partial<CorporateAction>) => {
    setActionDrafts((current) => current.map((action) => action.id === id ? { ...action, ...patch } : action));
    setActionError(null);
  };

  const saveActions = async (event: FormEvent) => {
    event.preventDefault();
    if (mutationPending.current) return;
    if (actionDrafts.some((action) => !isValidAction(action))) {
      setActionError('Each action needs a date and a valid forward or reverse share ratio.');
      return;
    }
    mutationPending.current = true;
    setIsSavingActions(true);
    setActionError(null);
    try {
      await onSaveCorporateActions(actionDrafts);
    } catch {
      setActionError('Unable to save corporate actions.');
    } finally {
      mutationPending.current = false;
      setIsSavingActions(false);
    }
  };
  const saveDividendSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (mutationPending.current) return;
    const normalizedDraft = dividendGrowthRateDraft.trim();
    const percent = normalizedDraft === '' ? null : Number(normalizedDraft);
    if (dividendGrowthRateBadInput || (percent !== null && (!Number.isFinite(percent) || percent < -100))) {
      setDividendGrowthRateError('Enter a finite dividend growth rate of -100% or greater.');
      return;
    }
    mutationPending.current = true;
    setIsSavingDividendSettings(true);
    setDividendGrowthRateError(null);
    setDividendSettingsError(null);
    setDividendSettingsSaved(false);
    try {
      await onSaveDividendSettings(percent === null ? null : percent / 100, manageDividendsDraft);
      setDividendSettingsSaved(true);
    } catch {
      setDividendSettingsError('Unable to save dividend settings.');
    } finally {
      mutationPending.current = false;
      setIsSavingDividendSettings(false);
    }
  };

  const removePayments = async () => {
    if (!onRemovePayments || !hasSavedPayments || mutationPending.current) return;
    if (!window.confirm(`Remove all source, manual, and projected payments for ${security.symbol}? Holdings and dividend settings are kept. Refreshing distributions can load source payments again.`)) return;
    mutationPending.current = true;
    setIsRemovingPayments(true);
    setRemovePaymentsError(null);
    setPaymentsRemoved(false);
    try {
      await onRemovePayments();
      setPaymentsRemoved(true);
    } catch {
      setRemovePaymentsError('Unable to remove payments. Existing records are still shown. Try again.');
    } finally {
      mutationPending.current = false;
      setIsRemovingPayments(false);
    }
  };


  return (
    <div className="modal-overlay" onClick={onClose}>
      <section ref={dialogRef} className="modal-container security-details-modal" role="dialog" aria-modal="true" aria-labelledby="security-details-title" onClick={(event) => event.stopPropagation()}>
        <div className="security-details-heading">
          <div><h2 id="security-details-title">{security.symbol} security details</h2><p>{security.name}</p></div>
          <button ref={closeButtonRef} className="link-button holdings-refresh-action" type="button" onClick={onClose} aria-label="Close security details"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
        </div>

        <div className="security-details-tabs" role="tablist" aria-label="Security information">
          <button id="security-details-tab" role="tab" type="button" aria-selected={activeTab === 'details'} aria-controls="security-details-panel" className={activeTab === 'details' ? 'security-details-tab-active' : undefined} onClick={() => setActiveTab('details')}>Details</button>
          <button id="security-actions-tab" role="tab" type="button" aria-selected={activeTab === 'actions'} aria-controls="security-actions-panel" className={activeTab === 'actions' ? 'security-details-tab-active' : undefined} onClick={() => setActiveTab('actions')}>Corporate actions ({actionDrafts.length})</button>
        </div>

        {activeTab === 'details' ? (
          <form id="security-details-panel" role="tabpanel" aria-labelledby="security-details-tab" noValidate onSubmit={(event) => void saveDividendSettings(event)}>
            <section aria-labelledby="stock-details-heading" className="stock-details-evidence">
              <h3 id="stock-details-heading">{security.detailsStatus === 'stub' || detailsProvenance?.provider === 'stub' ? 'Stub security details' : detailsProvenance ? 'AI-researched details' : 'Saved security details'}</h3>
              {detailsProvenance ? <>
                {detailsProvenance.executionMode === 'registered_agent' ? <p className="status-copy">Registered Azure agent: {detailsProvenance.agentName} · version {detailsProvenance.agentVersion}</p> : null}
                <p className="status-copy">Last successful retrieval: <time dateTime={detailsProvenance.retrievedAt}>{detailsProvenance.retrievedAt}</time> · {security.detailsStatus}</p>
                <p className="status-copy">{detailsProvenance.provider === 'stub' ? 'Deterministic demonstration data; not market research.' : 'AI-researched market data may be delayed and is non-authoritative. Observation dates apply only to the fields shown.'}</p>
                {detailsProvenance.warnings.length ? <ul aria-label="Security detail warnings">{detailsProvenance.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
              </> : <p className="status-copy">Source and observation dates are unavailable for these saved values.</p>}
              <dl className="security-details-grid">
                <div><dt>Symbol</dt><dd>{security.symbol}</dd></div><div><dt>Exchange</dt><dd>{security.exchange}</dd></div><div><dt>Asset type</dt><dd>{security.assetType}</dd></div><div><dt>Currency</dt><dd>{security.currency}</dd></div>
                {detailFields.map(({ key, field, label, formatter }) => {
                  const value = security[key];
                  const evidence = detailsProvenance?.fieldEvidence.find((entry) => entry.field === field);
                  const basis = field === 'price' ? ({ last_trade: 'Regular-session last trade', close: 'Regular-session close', nav: 'Published NAV' }[detailsProvenance?.priceKind ?? 'close']) : null;
                  return <div key={key}><dt>{label}</dt><dd>
                    {typeof value === 'number' ? formatOptional(value, formatter) : typeof value === 'string' && value ? value : 'Not available'}
                    {value != null && detailsProvenance ? <small className="stock-detail-observation">{evidence ? <>{evidence.sourceIds.every((id) => id.startsWith('saved-')) ? 'Retained saved value · ' : ''}{basis ? `${basis} · ` : ''}As of <time dateTime={evidence.asOf}>{evidence.asOf}</time>{evidence.sourceIds.map((id) => {
                      const source = detailsProvenance.sources.find((entry) => entry.id === id);
                      const href = sourceLink(source?.url);
                      return href && source ? <span key={id}> · <a href={href} target="_blank" rel="noopener noreferrer">{source.title} (opens in new tab)</a></span> : null;
                    })}</> : detailsProvenance.provider === 'stub' ? 'Demonstration fixture · no market observation date' : 'Retained saved value · observation date unavailable in this research'}</small> : null}
                  </dd></div>;
                })}
              </dl>
            </section>
            <label className="configuration-checkbox" htmlFor="manage-dividends">
              <input id="manage-dividends" type="checkbox" checked={manageDividendsDraft} disabled={isMutationPending} aria-describedby="manage-dividends-help" onChange={(event) => { setManageDividendsDraft(event.target.checked); setDividendSettingsError(null); setDividendSettingsSaved(false); }} />
              <span>Manage Dividends</span>
            </label>
            <p id="manage-dividends-help" className="status-copy">When off, distribution research is skipped for this holding. Saved payments are kept.</p>
            <label className="field" htmlFor="dividend-growth-rate"><span>Dividend growth rate (%)</span>
              <input id="dividend-growth-rate" type="number" min="-100" step="any" disabled={isMutationPending} value={dividendGrowthRateDraft} aria-invalid={Boolean(dividendGrowthRateError)} aria-describedby={dividendGrowthRateError ? 'dividend-growth-rate-error' : undefined} onChange={(event) => { setDividendGrowthRateDraft(event.target.value); setDividendGrowthRateBadInput(event.target.validity.badInput); setDividendGrowthRateError(null); setDividendSettingsError(null); setDividendSettingsSaved(false); }} />
            </label>
            {dividendGrowthRateError ? <p id="dividend-growth-rate-error" className="form-error" role="alert">{dividendGrowthRateError}</p> : null}
            {dividendSettingsError ? <p className="form-error" role="alert">{dividendSettingsError}</p> : null}
            {dividendSettingsSaved ? <p className="status-copy" role="status">Dividend settings saved.</p> : null}
            <div className="modal-actions">
              <button className="secondary-action" type="button" disabled={!dividendSettingsChanged || isMutationPending} onClick={() => { setDividendGrowthRateDraft(savedDividendGrowthRateDraft); setManageDividendsDraft(manageDividends); setDividendGrowthRateBadInput(false); setDividendGrowthRateError(null); setDividendSettingsError(null); setDividendSettingsSaved(false); }}>Reset</button>
              <button className="primary-action" type="submit" disabled={!dividendSettingsChanged || isMutationPending}>{isSavingDividendSettings ? 'Saving...' : 'Save changes'}</button>
            </div>
            <section aria-labelledby="security-distributions-heading">
              <h3 id="security-distributions-heading">Distributions</h3>
              <p className="status-copy">Events use ex-dates. Projected amounts and dates are estimates.</p>
              {onRemovePayments ? <button className="link-button link-button-danger" type="button" disabled={!hasSavedPayments || isMutationPending} aria-busy={isRemovingPayments} onClick={() => void removePayments()}>{isRemovingPayments ? 'Removing payments…' : 'Remove payments'}</button> : null}
              {removePaymentsError ? <p className="form-error" role="alert">{removePaymentsError}</p> : null}
              {paymentsRemoved ? <p className="status-copy" role="status">Payments removed. Refresh distributions to load source payments again.</p> : null}
              {security.dividendResearchRetrievedAt ? <p className="status-copy">{security.dividendResearchProvider === 'stub' ? 'Stub data' : 'Last researched'}: {security.dividendResearchRetrievedAt}{security.dividendResearchStatus ? ` · ${security.dividendResearchStatus}` : ''}</p> : null}
              {security.dividendResearchWarnings?.length ? <ul>{security.dividendResearchWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul> : null}
              {distributions.length === 0 ? <p className="status-copy">No distribution events are available.</p> : distributions.map((payout, index) => {
                const currency = payout.currency || security.currency;
                const sourceUrl = sourceLink(payout.sourceUrl);
                const basis = payout.shareBasis || (payout.mode !== 'manual' ? security.dividendResearchAdjustmentBasis : undefined);
                return <details key={payout.eventId || `${payout.exDividendDate}-${index}`}>
                  <summary>{payout.exDividendDate} · {distributionStatus(payout)}{payout.excludedFromTotals ? ' · Conflicting event · excluded from totals' : ''} · {distributionAmount(payout, security.currency)} {currency} per share</summary>
                  <dl className="security-details-grid">
                    <div><dt>Ex-date</dt><dd>{payout.exDividendDate}</dd></div>
                    <div><dt>Payment date</dt><dd>{payout.paymentDate || 'Not available'}</dd></div>
                    <div><dt>Distribution type</dt><dd>{(payout.distributionType || 'income').replace(/_/g, ' ')}{payout.isRegular === false ? ' · excluded from recurring forecasts' : ''}</dd></div>
                    {payout.regularityBasis === 'inferred_cadence_v1' ? <div><dt>Schedule basis</dt><dd>Recurring cadence inferred from history; tax classification is unavailable.</dd></div> : null}
                    <div><dt>Source</dt><dd>{payout.mode === 'manual' || payout.source === 'user' ? 'User-entered' : sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{payout.source || 'Source'} (opens in new tab)</a> : payout.status === 'projected' ? 'Deterministic forecast' : 'Source unavailable'}</dd></div>
                    <div><dt>Share basis</dt><dd>{basis?.startsWith('as_of:') ? `Split-adjusted to ${basis.slice(6)}` : basis === 'current_share_basis' ? 'Split-adjusted to current shares' : basis === 'raw' ? 'Original share basis' : 'Not available'}{payout.rawAmount != null ? <small> · Original amount: {payout.rawAmount} {currency} per share</small> : null}</dd></div>
                    {payout.forecastMethod ? <div><dt>Forecast method</dt><dd>{payout.forecastMethod.replace(/_/g, ' ')}</dd></div> : null}
                    {payout.forecastRange ? <div><dt>Historical estimate range</dt><dd>{payout.forecastRange.min}–{payout.forecastRange.max} {currency} per share; not a confidence interval.</dd></div> : null}
                  </dl>
                </details>;
              })}
            </section>
          </form>
        ) : (
          <form id="security-actions-panel" role="tabpanel" aria-labelledby="security-actions-tab" onSubmit={(event) => void saveActions(event)}>
            {actionDrafts.length === 0 ? <p className="status-copy">No corporate actions are recorded for this security.</p> : <div className="security-actions-editor" role="group" aria-label="Corporate actions">
              {actionDrafts.map((action) => <div className="security-action-editor-row" key={action.id}>
                <label><span>Effective date</span><input type="date" disabled={isMutationPending} value={action.effectiveDate} onChange={(event) => updateAction(action.id, { effectiveDate: event.target.value })} /></label>
                <label><span>Action</span><select disabled={isMutationPending} value={action.type} onChange={(event) => updateAction(action.id, { type: event.target.value as CorporateAction['type'] })}><option value="stock_split">Stock split</option><option value="reverse_stock_split">Reverse stock split</option></select></label>
                <label><span>Old shares</span><input type="number" min="0.0001" step="any" disabled={isMutationPending} value={action.oldShares} onChange={(event) => updateAction(action.id, { oldShares: Number(event.target.value) || 0 })} /></label>
                <label><span>New shares</span><input type="number" min="0.0001" step="any" disabled={isMutationPending} value={action.newShares} onChange={(event) => updateAction(action.id, { newShares: Number(event.target.value) || 0 })} /></label>
                <button className="link-button link-button-danger" type="button" disabled={isMutationPending} onClick={() => { setActionDrafts((current) => current.filter((item) => item.id !== action.id)); setActionError(null); }} aria-label={`Delete corporate action dated ${action.effectiveDate}`}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button>
              </div>)}
            </div>}
            {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
            <div className="modal-actions">
              <button className="secondary-action" type="button" disabled={!actionsChanged || isMutationPending} onClick={() => { setActionDrafts(cloneActions(security.corporateActions)); setActionError(null); }}>Reset</button>
              <button className="primary-action" type="submit" disabled={!actionsChanged || isMutationPending}>{isSavingActions ? 'Saving...' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

