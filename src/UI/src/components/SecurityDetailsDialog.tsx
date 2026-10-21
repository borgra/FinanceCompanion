import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { CorporateAction, SecurityMetadata, SecurityPayoutDetails } from '../domain/holding';

type SecurityDetailsDialogProps = {
  security: SecurityMetadata;
  onClose: () => void;
  onSaveCorporateActions: (actions: CorporateAction[]) => Promise<void>;
  onSaveDividendGrowthRate: (dividendGrowthRate: number | null) => Promise<void>;
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
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

const isValidAction = (action: CorporateAction) =>
  Boolean(action.effectiveDate) && action.oldShares > 0 && action.newShares > 0 && action.oldShares !== action.newShares &&
  (action.type === 'stock_split' ? action.newShares > action.oldShares : action.newShares < action.oldShares);

export function SecurityDetailsDialog({ security, onClose, onSaveCorporateActions, onSaveDividendGrowthRate, onRemovePayments }: SecurityDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'actions'>('details');
  const [actionDrafts, setActionDrafts] = useState(() => cloneActions(security.corporateActions));
  const [isSavingActions, setIsSavingActions] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dividendGrowthRateDraft, setDividendGrowthRateDraft] = useState(() => toPercentDraft(security.dividendGrowthRate));
  const [dividendGrowthRateBadInput, setDividendGrowthRateBadInput] = useState(false);
  const [isSavingDividendGrowthRate, setIsSavingDividendGrowthRate] = useState(false);
  const [dividendGrowthRateError, setDividendGrowthRateError] = useState<string | null>(null);
  const [isRemovingPayments, setIsRemovingPayments] = useState(false);
  const [removePaymentsError, setRemovePaymentsError] = useState<string | null>(null);
  const [paymentsRemoved, setPaymentsRemoved] = useState(false);
  const mutationPending = useRef(false);
  const isMutationPending = isSavingActions || isSavingDividendGrowthRate || isRemovingPayments;
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
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const actionsChanged = JSON.stringify(actionDrafts) !== JSON.stringify(savedActions);
  const dividendGrowthRateChanged = dividendGrowthRateDraft !== savedDividendGrowthRateDraft;
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
  const saveDividendGrowthRate = async (event: FormEvent) => {
    event.preventDefault();
    if (mutationPending.current) return;
    const normalizedDraft = dividendGrowthRateDraft.trim();
    const percent = normalizedDraft === '' ? null : Number(normalizedDraft);
    if (dividendGrowthRateBadInput || (percent !== null && (!Number.isFinite(percent) || percent < -100))) {
      setDividendGrowthRateError('Enter a finite dividend growth rate of -100% or greater.');
      return;
    }
    mutationPending.current = true;
    setIsSavingDividendGrowthRate(true);
    setDividendGrowthRateError(null);
    try {
      await onSaveDividendGrowthRate(percent === null ? null : percent / 100);
    } catch {
      setDividendGrowthRateError('Unable to save the dividend growth rate.');
    } finally {
      mutationPending.current = false;
      setIsSavingDividendGrowthRate(false);
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
      <section className="modal-container security-details-modal" role="dialog" aria-modal="true" aria-labelledby="security-details-title" onClick={(event) => event.stopPropagation()}>
        <div className="security-details-heading">
          <div><h2 id="security-details-title">{security.symbol} security details</h2><p>{security.name}</p></div>
          <button ref={closeButtonRef} className="link-button holdings-refresh-action" type="button" onClick={onClose} aria-label="Close security details"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
        </div>

        <div className="security-details-tabs" role="tablist" aria-label="Security information">
          <button id="security-details-tab" role="tab" type="button" aria-selected={activeTab === 'details'} aria-controls="security-details-panel" className={activeTab === 'details' ? 'security-details-tab-active' : undefined} onClick={() => setActiveTab('details')}>Details</button>
          <button id="security-actions-tab" role="tab" type="button" aria-selected={activeTab === 'actions'} aria-controls="security-actions-panel" className={activeTab === 'actions' ? 'security-details-tab-active' : undefined} onClick={() => setActiveTab('actions')}>Corporate actions ({actionDrafts.length})</button>
        </div>

        {activeTab === 'details' ? (
          <form id="security-details-panel" role="tabpanel" aria-labelledby="security-details-tab" noValidate onSubmit={(event) => void saveDividendGrowthRate(event)}>
            <dl className="security-details-grid">
              <div><dt>Symbol</dt><dd>{security.symbol}</dd></div><div><dt>Exchange</dt><dd>{security.exchange}</dd></div><div><dt>Asset type</dt><dd>{security.assetType}</dd></div><div><dt>Currency</dt><dd>{security.currency}</dd></div><div><dt>Price</dt><dd>{formatOptional(security.price, currencyFormatter)}</dd></div><div><dt>Sector</dt><dd>{security.sector || 'Not available'}</dd></div><div><dt>Industry</dt><dd>{security.industry || 'Not available'}</dd></div><div><dt>P/E ratio</dt><dd>{formatOptional(security.peRatio)}</dd></div><div><dt>30-day yield</dt><dd>{formatOptional(security.thirtyDayYield, percentFormatter)}</dd></div><div><dt>52-week low</dt><dd>{formatOptional(security.fiftyTwoWeekLow, currencyFormatter)}</dd></div><div><dt>52-week high</dt><dd>{formatOptional(security.fiftyTwoWeekHigh, currencyFormatter)}</dd></div>
            </dl>
            <label className="field" htmlFor="dividend-growth-rate"><span>Dividend growth rate (%)</span>
              <input id="dividend-growth-rate" type="number" min="-100" step="any" disabled={isMutationPending} value={dividendGrowthRateDraft} aria-invalid={Boolean(dividendGrowthRateError)} aria-describedby={dividendGrowthRateError ? 'dividend-growth-rate-error' : undefined} onChange={(event) => { setDividendGrowthRateDraft(event.target.value); setDividendGrowthRateBadInput(event.target.validity.badInput); setDividendGrowthRateError(null); }} />
            </label>
            {dividendGrowthRateError ? <p id="dividend-growth-rate-error" className="form-error" role="alert">{dividendGrowthRateError}</p> : null}
            <div className="modal-actions">
              <button className="secondary-action" type="button" disabled={!dividendGrowthRateChanged || isMutationPending} onClick={() => { setDividendGrowthRateDraft(savedDividendGrowthRateDraft); setDividendGrowthRateBadInput(false); setDividendGrowthRateError(null); }}>Reset</button>
              <button className="primary-action" type="submit" disabled={!dividendGrowthRateChanged || isMutationPending}>{isSavingDividendGrowthRate ? 'Saving...' : 'Save changes'}</button>
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

