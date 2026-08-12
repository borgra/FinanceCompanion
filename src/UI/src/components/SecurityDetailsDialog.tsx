import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { CorporateAction, SecurityMetadata } from '../domain/holding';

type SecurityDetailsDialogProps = {
  security: SecurityMetadata;
  onClose: () => void;
  onSaveCorporateActions: (actions: CorporateAction[]) => Promise<void>;
  onSaveDividendGrowthRate: (dividendGrowthRate: number | null) => Promise<void>;
};

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 });

const formatOptional = (value: number | null | undefined, formatter = numberFormatter) =>
  value == null ? 'Not available' : formatter.format(value);

const cloneActions = (actions: CorporateAction[] = []) => actions.map((action) => ({ ...action }));
const toPercentDraft = (value: number | null | undefined) => value == null ? '' : String(value * 100);

const isValidAction = (action: CorporateAction) =>
  Boolean(action.effectiveDate) && action.oldShares > 0 && action.newShares > 0 && action.oldShares !== action.newShares &&
  (action.type === 'stock_split' ? action.newShares > action.oldShares : action.newShares < action.oldShares);

export function SecurityDetailsDialog({ security, onClose, onSaveCorporateActions, onSaveDividendGrowthRate }: SecurityDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'actions'>('details');
  const [actionDrafts, setActionDrafts] = useState(() => cloneActions(security.corporateActions));
  const [isSavingActions, setIsSavingActions] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dividendGrowthRateDraft, setDividendGrowthRateDraft] = useState(() => toPercentDraft(security.dividendGrowthRate));
  const [dividendGrowthRateBadInput, setDividendGrowthRateBadInput] = useState(false);
  const [isSavingDividendGrowthRate, setIsSavingDividendGrowthRate] = useState(false);
  const [dividendGrowthRateError, setDividendGrowthRateError] = useState<string | null>(null);
  const savedActions = useMemo(() => cloneActions(security.corporateActions), [security.corporateActions]);
  const savedDividendGrowthRateDraft = useMemo(() => toPercentDraft(security.dividendGrowthRate), [security.dividendGrowthRate]);

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
    if (actionDrafts.some((action) => !isValidAction(action))) {
      setActionError('Each action needs a date and a valid forward or reverse share ratio.');
      return;
    }
    setIsSavingActions(true);
    setActionError(null);
    try {
      await onSaveCorporateActions(actionDrafts);
    } catch {
      setActionError('Unable to save corporate actions.');
    } finally {
      setIsSavingActions(false);
    }
  };
  const saveDividendGrowthRate = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedDraft = dividendGrowthRateDraft.trim();
    const percent = normalizedDraft === '' ? null : Number(normalizedDraft);
    if (dividendGrowthRateBadInput || (percent !== null && (!Number.isFinite(percent) || percent < -100))) {
      setDividendGrowthRateError('Enter a finite dividend growth rate of -100% or greater.');
      return;
    }
    setIsSavingDividendGrowthRate(true);
    setDividendGrowthRateError(null);
    try {
      await onSaveDividendGrowthRate(percent === null ? null : percent / 100);
    } catch {
      setDividendGrowthRateError('Unable to save the dividend growth rate.');
    } finally {
      setIsSavingDividendGrowthRate(false);
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
              <input id="dividend-growth-rate" type="number" min="-100" step="any" value={dividendGrowthRateDraft} aria-invalid={Boolean(dividendGrowthRateError)} aria-describedby={dividendGrowthRateError ? 'dividend-growth-rate-error' : undefined} onChange={(event) => { setDividendGrowthRateDraft(event.target.value); setDividendGrowthRateBadInput(event.target.validity.badInput); setDividendGrowthRateError(null); }} />
            </label>
            {dividendGrowthRateError ? <p id="dividend-growth-rate-error" className="form-error" role="alert">{dividendGrowthRateError}</p> : null}
            <div className="modal-actions">
              <button className="secondary-action" type="button" disabled={!dividendGrowthRateChanged || isSavingDividendGrowthRate} onClick={() => { setDividendGrowthRateDraft(savedDividendGrowthRateDraft); setDividendGrowthRateBadInput(false); setDividendGrowthRateError(null); }}>Reset</button>
              <button className="primary-action" type="submit" disabled={!dividendGrowthRateChanged || isSavingDividendGrowthRate}>{isSavingDividendGrowthRate ? 'Saving...' : 'Save changes'}</button>
            </div>
          </form>
        ) : (
          <form id="security-actions-panel" role="tabpanel" aria-labelledby="security-actions-tab" onSubmit={(event) => void saveActions(event)}>
            {actionDrafts.length === 0 ? <p className="status-copy">No corporate actions are recorded for this security.</p> : <div className="security-actions-editor" role="group" aria-label="Corporate actions">
              {actionDrafts.map((action) => <div className="security-action-editor-row" key={action.id}>
                <label><span>Effective date</span><input type="date" value={action.effectiveDate} onChange={(event) => updateAction(action.id, { effectiveDate: event.target.value })} /></label>
                <label><span>Action</span><select value={action.type} onChange={(event) => updateAction(action.id, { type: event.target.value as CorporateAction['type'] })}><option value="stock_split">Stock split</option><option value="reverse_stock_split">Reverse stock split</option></select></label>
                <label><span>Old shares</span><input type="number" min="0.0001" step="any" value={action.oldShares} onChange={(event) => updateAction(action.id, { oldShares: Number(event.target.value) || 0 })} /></label>
                <label><span>New shares</span><input type="number" min="0.0001" step="any" value={action.newShares} onChange={(event) => updateAction(action.id, { newShares: Number(event.target.value) || 0 })} /></label>
                <button className="link-button link-button-danger" type="button" disabled={isSavingActions} onClick={() => { setActionDrafts((current) => current.filter((item) => item.id !== action.id)); setActionError(null); }} aria-label={`Delete corporate action dated ${action.effectiveDate}`}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button>
              </div>)}
            </div>}
            {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
            <div className="modal-actions">
              <button className="secondary-action" type="button" disabled={!actionsChanged || isSavingActions} onClick={() => { setActionDrafts(cloneActions(security.corporateActions)); setActionError(null); }}>Reset</button>
              <button className="primary-action" type="submit" disabled={!actionsChanged || isSavingActions}>{isSavingActions ? 'Saving...' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

