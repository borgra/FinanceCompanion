import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountRepository } from '../../domain/accountRepository';
import type { HoldingRepository } from '../../domain/holdingRepository';
import { createDefaultRetirementPlan, type RetirementPlan } from '../../domain/retirementPlan';
import type { RetirementPlanRepository } from '../../domain/retirementPlanRepository';
import {
  calculateRetirementProjection,
  validateRetirementPlan,
  valueRetirementHoldings,
  type ProjectionResult,
  type ProjectionRow,
  type ValuationSnapshot,
} from './calculator';

type Props = {
  accountRepository: AccountRepository;
  holdingRepository: HoldingRepository;
  retirementPlanRepository: RetirementPlanRepository;
  onAddHoldings?: () => void;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const statusText = (status: ProjectionRow['status']) => status.replace(/_/g, ' ');

function NumberField({ id, label, value, onChange, min, max, step = 1, error, allowBlank = false }: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  allowBlank?: boolean;
}) {
  return (
    <label className="retirement-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value === '' && allowBlank ? null : Number(event.target.value))}
      />
      {error && <small id={`${id}-error`} className="field-error">{error}</small>}
    </label>
  );
}

type AssumptionPanelId = 'about' | 'growth' | 'contributions' | 'socialSecurity' | 'expenseChanges';

const initialOpenPanels: Record<AssumptionPanelId, boolean> = {
  about: true,
  growth: true,
  contributions: false,
  socialSecurity: false,
  expenseChanges: false,
};

function AssumptionGroup({ title, children, className = '', open, onOpenChange }: {
  title: string;
  children: React.ReactNode;
  className?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <details className={`retirement-assumption-section ${className}`.trim()} open={open} onToggle={(event) => {
      if (event.currentTarget.open !== open) onOpenChange(event.currentTarget.open);
    }}>
      <summary className="retirement-assumption-heading">{title}</summary>
      <div className="retirement-assumption-grid">{children}</div>
    </details>
  );
}

export function RetirementPlanningPage({ accountRepository, holdingRepository, retirementPlanRepository, onAddHoldings }: Props) {
  const [plan, setPlan] = useState(createDefaultRetirementPlan);
  const [valuation, setValuation] = useState<ValuationSnapshot>();
  const [result, setResult] = useState<ProjectionResult>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [stale, setStale] = useState(false);
  const [detailRow, setDetailRow] = useState<ProjectionRow>();
  const [openPanels, setOpenPanels] = useState<Record<AssumptionPanelId, boolean>>(initialOpenPanels);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const detailTrigger = useRef<HTMLButtonElement>();

  const load = useCallback(async () => {
    setState('loading');
    setMessage('');
    try {
      const [savedPlan, accounts, holdings] = await Promise.all([
        retirementPlanRepository.get(),
        accountRepository.listAccounts(),
        holdingRepository.listHoldings(),
      ]);
      const nextPlan = savedPlan ?? createDefaultRetirementPlan();
      const nextValuation = valueRetirementHoldings(accounts, holdings);
      setPlan(nextPlan);
      setValuation(nextValuation);
      setResult(savedPlan && Object.keys(validateRetirementPlan(nextPlan)).length === 0
        ? calculateRetirementProjection(nextPlan, nextValuation)
        : undefined);
      setStale(false);
      setState('ready');
    } catch {
      setMessage('The plan or portfolio could not be loaded. Try again.');
      setState('error');
    }
  }, [accountRepository, holdingRepository, retirementPlanRepository]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!detailRow) return;
    const modal = dialog.current;
    const close = modal?.querySelector<HTMLButtonElement>('.close-detail');
    close?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDetailRow(undefined);
        return;
      }
      if (event.key !== 'Tab' || !modal) return;
      const focusable = [...modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      detailTrigger.current?.focus();
    };
  }, [detailRow]);

  const change = (next: RetirementPlan) => {
    setPlan(next);
    setStale(Boolean(result));
    setMessage('');
  };

  const showDetails = (row: ProjectionRow, trigger: HTMLButtonElement) => {
    detailTrigger.current = trigger;
    setDetailRow(row);
  };

  const setPanelOpen = (panel: AssumptionPanelId, open: boolean) => {
    setOpenPanels((current) => ({ ...current, [panel]: open }));
  };

  const calculate = async () => {
    if (!valuation) return;
    const nextErrors = validateRetirementPlan(plan);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setOpenPanels((current) => ({
        ...current,
        about: current.about || Boolean(nextErrors.currentAge || nextErrors.retirementAge || nextErrors.longevityAge),
        growth: current.growth || Boolean(nextErrors.annualRoiPercent || nextErrors.annualRetirementExpense),
        contributions: current.contributions || Boolean(nextErrors.taxableContributionAmount || nextErrors.retirementContributionAmount || nextErrors.contributionIncrease || nextErrors.contributionEndAge),
        socialSecurity: current.socialSecurity || Boolean(nextErrors.socialSecurityBenefit || nextErrors.claimAge || nextErrors.socialSecurityCola),
        expenseChanges: current.expenseChanges || Boolean(nextErrors.expenseChanges),
      }));
      setMessage('Correct the highlighted assumptions before calculating.');
      window.setTimeout(() => errorSummary.current?.focus(), 0);
      return;
    }
    setState('saving');
    try {
      const saved = await retirementPlanRepository.put(plan);
      setPlan(saved);
      setResult(calculateRetirementProjection(saved, valuation));
      setStale(false);
      setMessage(valuation.isComplete === false
        ? 'Base Plan saved. This projection is incomplete because some positions were excluded.'
        : 'Base Plan saved and recalculated.');
      setState('ready');
      window.setTimeout(() => resultsHeading.current?.focus(), 0);
    } catch {
      setMessage('The plan could not be saved. Your last valid result is still shown.');
      setState('ready');
    }
  };

  if (state === 'loading') return <p role="status">Loading retirement plan and portfolio…</p>;
  if (state === 'error') return (
    <div className="empty-state">
      <h2>Retirement Planning</h2>
      <p role="alert">{message}</p>
      <button type="button" className="primary-action" onClick={() => void load()}>Retry</button>
    </div>
  );

  const hasNoValuedHoldings = !valuation?.taxable && !valuation?.retirement && !valuation?.hsa;
  const chartMaximum = Math.max(...(result?.rows.map((item) => item.totalEnd) ?? [0]), 1);
  const markers = [
    `Retirement at age ${plan.retirementAge}`,
    'Retirement-account access at age 60',
    ...(plan.socialSecurity.enabled ? [`Social Security starts at age ${plan.socialSecurity.claimAge}`] : []),
    ...plan.expenseChanges.map((change) => `${change.label?.trim() || 'Expense change'} at age ${change.age}: ${change.percentChange}%`),
  ];
  const contributionRows = result?.rows.filter((row) => row.age < plan.retirementAge) ?? [];
  const bridgeRows = result?.rows.filter((row) => row.age >= plan.retirementAge && row.age < 60) ?? [];
  const standardRetirementRows = result?.rows.filter((row) => row.age >= Math.max(plan.retirementAge, 60)) ?? [];

  return (
    <div className="retirement-planner">

      <div className="retirement-layout">
        <form className="retirement-assumptions" onSubmit={(event) => { event.preventDefault(); void calculate(); }} noValidate>
          <div className="retirement-assumptions-header">
            <p className="eyebrow">Base Plan inputs</p>
            <h2>Plan assumptions</h2>
            <p>Adjust the values below, then recalculate your saved projection. This is educational planning, not financial or tax advice.</p>
          </div>
          <div className="retirement-valuation-status" aria-label="Portfolio valuation status">
            <p className="retirement-source">
              Price freshness: {valuation?.valuedAt ? `oldest included price saved ${new Date(valuation.valuedAt).toLocaleString()}` : 'unavailable'} · {valuation?.source}
            </p>
            {hasNoValuedHoldings && (
              <div className="notice">
                <p>No valued holdings. You can still calculate a zero-balance scenario.</p>
                {onAddHoldings && <button type="button" className="text-action" onClick={onAddHoldings}>Add holdings</button>}
              </div>
            )}
            {valuation?.warnings.length ? (
              <div className="notice warning" role="status">
                <strong>Incomplete valuation — excluded positions are not included in this forecast.</strong>
                <ul>{valuation.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul>
              </div>
            ) : <p className="notice success">All assigned supported USD holdings with positive saved prices are included.</p>}
          </div>
          {Object.keys(errors).length > 0 && (
            <div className="notice warning retirement-error-summary" role="alert" tabIndex={-1} ref={errorSummary}>
              <strong>Correct these assumptions:</strong>
              <ul>{Object.values(errors).map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          )}
          <AssumptionGroup title="About you" open={openPanels.about} onOpenChange={(open) => setPanelOpen('about', open)}>
            <NumberField id="current-age" label="Current age" min={18} max={100} value={plan.currentAge} error={errors.currentAge} onChange={(value) => change({ ...plan, currentAge: value ?? 0 })} />
            <NumberField id="retirement-age" label="Retirement age" min={18} max={120} value={plan.retirementAge} error={errors.retirementAge} onChange={(value) => change({ ...plan, retirementAge: value ?? 0 })} />
            <NumberField id="planning-age" label="Planning age" min={19} max={120} value={plan.longevityAge} error={errors.longevityAge} onChange={(value) => change({ ...plan, longevityAge: value ?? 0 })} />
            {plan.retirementAge < 60 && <p className="field-hint">Before age 60, planned spending can use only Taxable funds in this model.</p>}
          </AssumptionGroup>
          <AssumptionGroup title="Growth and withdrawals" open={openPanels.growth} onOpenChange={(open) => setPanelOpen('growth', open)}>
            <NumberField id="annual-roi" label="Annual ROI (%)" min={-100} max={100} step={0.1} allowBlank value={plan.annualRoiPercent} error={errors.annualRoiPercent} onChange={(value) => change({ ...plan, annualRoiPercent: value })} />
            <p className="field-hint">Required assumption; no return is recommended or preselected.</p>
            <NumberField id="annual-withdrawal" label="Annual withdrawal ($)" min={0} step={100} value={plan.annualRetirementExpense} error={errors.annualRetirementExpense} onChange={(value) => change({ ...plan, annualRetirementExpense: value ?? 0 })} />
            <p className="field-hint">Social Security reduces the amount drawn from your portfolio.</p>
          </AssumptionGroup>
          <AssumptionGroup title="Monthly contributions" open={openPanels.contributions} onOpenChange={(open) => setPanelOpen('contributions', open)}>
            <div className="retirement-contribution-grid">
              <div className="retirement-contribution-set">
                <h3>Taxable</h3>
                <NumberField id="taxable-contribution" label="Taxable monthly contribution" min={0} value={plan.taxableContribution.monthlyAmount} error={errors.taxableContributionAmount} onChange={(value) => change({ ...plan, taxableContribution: { ...plan.taxableContribution, monthlyAmount: value ?? 0 } })} />
                <NumberField id="taxable-increase" label="Taxable annual increase (%)" min={0} max={100} step={0.1} value={plan.taxableContribution.annualIncreasePercent} error={errors.contributionIncrease} onChange={(value) => change({ ...plan, taxableContribution: { ...plan.taxableContribution, annualIncreasePercent: value ?? 0 } })} />
                <NumberField id="taxable-end-age" label="Taxable contribution end age" min={plan.currentAge} max={plan.longevityAge} value={plan.taxableContribution.endAge} error={errors.contributionEndAge} onChange={(value) => change({ ...plan, taxableContribution: { ...plan.taxableContribution, endAge: value ?? 0 } })} />
              </div>
              <div className="retirement-contribution-set">
                <h3>Retirement</h3>
                <NumberField id="retirement-contribution" label="Retirement monthly contribution" min={0} value={plan.retirementContribution.monthlyAmount} error={errors.retirementContributionAmount} onChange={(value) => change({ ...plan, retirementContribution: { ...plan.retirementContribution, monthlyAmount: value ?? 0 } })} />
                <NumberField id="retirement-increase" label="Retirement annual increase (%)" min={0} max={100} step={0.1} value={plan.retirementContribution.annualIncreasePercent} error={errors.contributionIncrease} onChange={(value) => change({ ...plan, retirementContribution: { ...plan.retirementContribution, annualIncreasePercent: value ?? 0 } })} />
                <NumberField id="retirement-end-age" label="Retirement contribution end age" min={plan.currentAge} max={plan.longevityAge} value={plan.retirementContribution.endAge} error={errors.contributionEndAge} onChange={(value) => change({ ...plan, retirementContribution: { ...plan.retirementContribution, endAge: value ?? 0 } })} />
              </div>
            </div>
          </AssumptionGroup>
          <AssumptionGroup title="Social Security" open={openPanels.socialSecurity} onOpenChange={(open) => setPanelOpen('socialSecurity', open)}>
            <label className="checkbox-row retirement-full-row"><input type="checkbox" checked={plan.socialSecurity.enabled} onChange={(event) => change({ ...plan, socialSecurity: { ...plan.socialSecurity, enabled: event.target.checked } })} /> Include user-entered benefit</label>
            <NumberField id="social-security-age" label="Social Security claim age" min={62} max={plan.longevityAge} value={plan.socialSecurity.claimAge} error={errors.claimAge} onChange={(value) => change({ ...plan, socialSecurity: { ...plan.socialSecurity, claimAge: value ?? 0 } })} />
            <NumberField id="social-security-benefit" label="Monthly Social Security benefit" min={0} value={plan.socialSecurity.monthlyBenefit} error={errors.socialSecurityBenefit} onChange={(value) => change({ ...plan, socialSecurity: { ...plan.socialSecurity, monthlyBenefit: value ?? 0 } })} />
            <NumberField id="social-security-cola" label="Annual COLA (%)" min={0} max={100} step={0.1} value={plan.socialSecurity.annualColaPercent} error={errors.socialSecurityCola} onChange={(value) => change({ ...plan, socialSecurity: { ...plan.socialSecurity, annualColaPercent: value ?? 0 } })} />
          </AssumptionGroup>
          <AssumptionGroup title="Expense changes" className="retirement-expense-section" open={openPanels.expenseChanges} onOpenChange={(open) => setPanelOpen('expenseChanges', open)}>
            {plan.expenseChanges.map((expenseChange, index) => (
              <div className="expense-change-row" key={`${expenseChange.age}-${index}`}>
                <NumberField id={`expense-change-${index}-age`} label={`Change ${index + 1} age`} min={plan.retirementAge} max={plan.longevityAge} value={expenseChange.age} error={errors.expenseChanges} onChange={(value) => change({ ...plan, expenseChanges: plan.expenseChanges.map((item, itemIndex) => itemIndex === index ? { ...item, age: value ?? 0 } : item) })} />
                <NumberField id={`expense-change-${index}-percent`} label={`Change ${index + 1} (%)`} min={-100} max={100} step={0.1} value={expenseChange.percentChange} error={errors.expenseChanges} onChange={(value) => change({ ...plan, expenseChanges: plan.expenseChanges.map((item, itemIndex) => itemIndex === index ? { ...item, percentChange: value ?? 0 } : item) })} />
                <label className="retirement-field" htmlFor={`expense-change-${index}-label`}><span>Change label</span><input id={`expense-change-${index}-label`} maxLength={120} value={expenseChange.label ?? ''} onChange={(event) => change({ ...plan, expenseChanges: plan.expenseChanges.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></label>
                {expenseChange.percentChange > 0 && <small className="warning-text">This permanently increases planned expense.</small>}
                <button type="button" className="secondary-action" onClick={() => change({ ...plan, expenseChanges: plan.expenseChanges.filter((_, itemIndex) => itemIndex !== index) })}>Remove change</button>
              </div>
            ))}
            <button type="button" className="secondary-action" onClick={() => change({ ...plan, expenseChanges: [...plan.expenseChanges, { age: plan.retirementAge, percentChange: 0, label: '' }] })}>Add expense change</button>
          </AssumptionGroup>
          <div className="retirement-form-actions">
            <label className="checkbox-row"><input type="checkbox" checked={plan.includeHsaInRetirement} onChange={(event) => change({ ...plan, includeHsaInRetirement: event.target.checked })} /> Include HSA with Retirement spending funds (simplified; not tax advice)</label>
            <button className="primary-action" type="submit" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Calculate Plan'}</button>
            {stale && <p className="notice" role="status">Not recalculated — assumptions changed.</p>}
            {message && <p className="notice" role="status">{message}</p>}
          </div>
        </form>

        <section className="retirement-results" aria-labelledby="retirement-results-title">
          <div className="retirement-results-header">
            <p className="eyebrow">Annual projection</p>
            <h2 id="retirement-results-title" ref={resultsHeading} tabIndex={-1}>Projection results</h2>
          </div>
          {!result ? <p>Enter assumptions and choose Calculate Plan.</p> : (
            <>
              {!result.valuationComplete && <p className="notice warning" role="status"><strong>Incomplete projection:</strong> positions listed above were excluded; do not treat this as a complete portfolio forecast.</p>}
              <dl className="retirement-summary">
                <div><dt>Opening balance:</dt><dd>{currency.format(result.openingTaxable + result.openingRetirement)}</dd></div>
                <div><dt>Balance at retirement:</dt><dd>{currency.format(result.balanceAtRetirement)}</dd></div>
                <div><dt>First retirement-year need:</dt><dd>{currency.format(result.firstRetirementYearNeed)}</dd></div>
                <div><dt>Ending balance:</dt><dd>{currency.format(result.rows[result.rows.length - 1]?.totalEnd ?? 0)}</dd></div>
              </dl>
              <div className={`retirement-outcome ${result.firstGapAge ? 'has-gap' : ''}`}>
                <p><strong>Outcome:</strong> {result.firstGapAge ? `First projected funding gap at age ${result.firstGapAge}.` : result.firstDepletionAge ? `Projected assets first reach zero at age ${result.firstDepletionAge}.` : 'No projected funding gap or asset depletion through the planning age.'}</p>
                {result.excludedHsa > 0 && <p>{currency.format(result.excludedHsa)} HSA excluded from spending.</p>}
              </div>
              <figure className="retirement-chart" aria-labelledby="projection-chart-caption">
                <figcaption id="projection-chart-caption">Estimated total portfolio by age with plan milestones.</figcaption>
                <div className="retirement-chart-plot">
                  <div className="retirement-chart-axis" aria-hidden="true"><span>{currency.format(chartMaximum)}</span><span>{currency.format(chartMaximum / 2)}</span><span>$0</span></div>
                  <div className="retirement-chart-bars" aria-hidden="true">{result.rows.map((row) => <span key={row.age} className={row.unmetNeed ? 'has-gap' : ''} style={{ height: `${Math.max(2, row.totalEnd / chartMaximum * 100)}%` }} title={`Age ${row.age}: ${currency.format(row.totalEnd)}`} />)}</div>
                </div>
                <ul className="retirement-chart-markers" aria-label="Projection milestones">{markers.map((marker) => <li key={marker}>{marker}</li>)}</ul>
              </figure>
              <section className="retirement-phase" aria-labelledby="contribution-years-title">
                <h3 id="contribution-years-title">Contribution years</h3>
                <p>Both accounts compound before retirement. Contributions are added after annual growth.</p>
                <div className="retirement-table-wrap">
                  <table className="retirement-table retirement-table--contribution">
                    <caption>Contribution Years — annual compounding projection.</caption>
                    <thead><tr><td className="contribution-header-spacer" colSpan={2} aria-hidden="true" /><th className="contribution-taxable-group" colSpan={4} scope="colgroup">Taxable</th><th className="contribution-retirement-group" colSpan={4} scope="colgroup">Retirement</th><td className="contribution-header-spacer" aria-hidden="true" /></tr><tr><th>Year</th><th>Age</th><th className="contribution-taxable-column">Start</th><th className="contribution-taxable-column">Contribution</th><th className="contribution-taxable-column">Growth</th><th className="contribution-taxable-column">End</th><th className="contribution-retirement-column contribution-retirement-start">Start</th><th className="contribution-retirement-column">Contribution</th><th className="contribution-retirement-column">Growth</th><th className="contribution-retirement-column">End</th><th>End total</th></tr></thead>
                    <tbody>{contributionRows.length ? contributionRows.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{row.age}</td><td>{currency.format(row.startTaxable)}</td><td>{currency.format(row.taxableContribution)}</td><td>{currency.format(row.taxableGrowth)}</td><td>{currency.format(row.endTaxable)}</td><td>{currency.format(row.startRetirement)}</td><td>{currency.format(row.retirementContribution)}</td><td>{currency.format(row.retirementGrowth)}</td><td>{currency.format(row.endRetirement)}</td><td>{currency.format(row.totalEnd)}</td></tr>) : <tr><td colSpan={11}>No contribution years in this plan.</td></tr>}</tbody>
                  </table>
                </div>
              </section>
              <section className="retirement-phase" aria-labelledby="bridge-retirement-years-title">
                <h3 id="bridge-retirement-years-title">Retirement years before age 60</h3>
                <p>Taxable assets fund withdrawals in this bridge period; retirement assets continue compounding.</p>
                <div className="retirement-table-wrap">
                  <table className="retirement-table retirement-table--bridge">
                    <caption>Retirement Years before age 60 — taxable account drawdown.</caption>
                    <thead><tr><td className="bridge-header-spacer" colSpan={2} aria-hidden="true" /><th className="bridge-taxable-group" colSpan={3} scope="colgroup">Taxable</th><th className="bridge-retirement-group" scope="colgroup">Retirement</th><td className="bridge-header-spacer" colSpan={3} aria-hidden="true" /></tr><tr><th>Year</th><th>Age</th><th className="bridge-taxable-column">Start</th><th className="bridge-taxable-column">Withdrawal</th><th className="bridge-taxable-column">End</th><th className="bridge-retirement-column">End</th><th>Funding gap</th><th>Detail</th></tr></thead>
                    <tbody>{bridgeRows.length ? bridgeRows.map((row) => <tr key={row.year} className={row.unmetNeed ? 'projection-gap' : undefined}><th scope="row">{row.year}</th><td>{row.age}</td><td>{currency.format(row.startTaxable)}</td><td>{currency.format(row.taxableWithdrawal)}</td><td>{currency.format(row.endTaxable)}</td><td>{currency.format(row.endRetirement)}</td><td>{currency.format(row.unmetNeed)}</td><td><button type="button" className="text-action" onClick={(event) => showDetails(row, event.currentTarget)} aria-label={`Show calculation details for age ${row.age}`}>Details</button></td></tr>) : <tr><td colSpan={8}>No retirement years before age 60 apply to this plan.</td></tr>}</tbody>
                  </table>
                </div>
              </section>
              <section className="retirement-phase" aria-labelledby="standard-retirement-years-title">
                <h3 id="standard-retirement-years-title">Retirement years from age 60</h3>
                <p>Taxable assets are used first, then retirement assets fund any remaining withdrawal need.</p>
                <div className="retirement-table-wrap">
                  <table className="retirement-table retirement-table--standard">
                    <caption>Retirement Years from age 60 — standard retirement planning.</caption>
                    <thead><tr><td className="standard-header-spacer" colSpan={2} aria-hidden="true" /><th className="standard-taxable-group" colSpan={4} scope="colgroup">Taxable</th><th className="standard-retirement-group" colSpan={4} scope="colgroup">Retirement</th><td className="standard-header-spacer" colSpan={5} aria-hidden="true" /></tr><tr><th>Year</th><th>Age</th><th className="standard-taxable-column">Start</th><th className="standard-taxable-column">Contribution</th><th className="standard-taxable-column">Growth</th><th className="standard-taxable-column">End</th><th className="standard-retirement-column">Start</th><th className="standard-retirement-column">Contribution</th><th className="standard-retirement-column">Growth</th><th className="standard-retirement-column">End</th><th>Social Security</th><th>Withdrawal</th><th>End total</th><th>Status</th><th>Detail</th></tr></thead>
                    <tbody>{standardRetirementRows.length ? standardRetirementRows.map((row) => <tr key={row.year} className={row.unmetNeed ? 'projection-gap' : undefined}><th scope="row">{row.year}</th><td>{row.age}</td><td>{currency.format(row.startTaxable)}</td><td>{currency.format(row.taxableContribution)}</td><td>{currency.format(row.taxableGrowth)}</td><td>{currency.format(row.endTaxable)}</td><td>{currency.format(row.startRetirement)}</td><td>{currency.format(row.retirementContribution)}</td><td>{currency.format(row.retirementGrowth)}</td><td>{currency.format(row.endRetirement)}</td><td>{currency.format(row.socialSecurity)}</td><td>{currency.format(row.totalWithdrawal)}</td><td>{currency.format(row.totalEnd)}</td><td>{statusText(row.status)}</td><td><button type="button" className="text-action" onClick={(event) => showDetails(row, event.currentTarget)} aria-label={`Show calculation details for age ${row.age}`}>Details</button></td></tr>) : <tr><td colSpan={15}>No retirement years from age 60 apply to this plan.</td></tr>}</tbody>
                  </table>
                </div>
              </section>
              <div className="retirement-mobile-cards" aria-label="Annual projection details">{[
                { title: 'Contribution years', rows: contributionRows },
                { title: 'Retirement years before age 60', rows: bridgeRows },
                { title: 'Retirement years from age 60', rows: standardRetirementRows },
              ].map((phase) => <section key={phase.title} className="retirement-mobile-phase"><h3>{phase.title}</h3>{phase.rows.length ? phase.rows.map((row) => <details key={row.year}><summary>{row.year} · Age {row.age} · {statusText(row.status)}</summary><p>Starting taxable: {currency.format(row.startTaxable)}</p><p>Starting retirement: {currency.format(row.startRetirement)}</p><p>Taxable contribution: {currency.format(row.taxableContribution)}</p><p>Retirement contribution: {currency.format(row.retirementContribution)}</p>{row.age >= plan.retirementAge && <><p>Social Security: {currency.format(row.socialSecurity)}</p><p>Planned withdrawal: {currency.format(row.expense)}</p><p>Taxable withdrawal: {currency.format(row.taxableWithdrawal)}</p><p>Retirement withdrawal: {currency.format(row.retirementWithdrawal)}</p><p>Total withdrawal: {currency.format(row.totalWithdrawal)}</p></>}<p>Taxable growth: {currency.format(row.taxableGrowth)}</p><p>Retirement growth: {currency.format(row.retirementGrowth)}</p><p>Ending taxable: {currency.format(row.endTaxable)}</p><p>Ending retirement: {currency.format(row.endRetirement)}</p><p>Ending total: {currency.format(row.totalEnd)}</p><p>Status: {statusText(row.status)}</p><p>Funding gap: {currency.format(row.unmetNeed)}</p>{row.age >= plan.retirementAge && <button type="button" className="text-action" onClick={(event) => showDetails(row, event.currentTarget)}>Calculation details</button>}</details>) : <p>No years in this phase.</p>}</section>)}</div>
            </>
          )}
          <details className="methodology"><summary>Methodology and limitations</summary><p>Before retirement, each account uses: starting amount × (1 + ROI) + contribution. During retirement, withdrawals reduce principal before growth. Taxable funds are used first. Retirement funds are unavailable through age 59 and available starting at 60.</p><p>Excluded: taxes, Roth/traditional treatment, RMDs, early-withdrawal exceptions, inflation, Monte Carlo, pensions, spouses, Medicare, recommendations, and automated Social Security estimates.</p></details>
        </section>
      </div>
      {detailRow && (
        <section className="retirement-detail" role="dialog" aria-modal="true" aria-labelledby="row-detail-title" ref={dialog} onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailRow(undefined); }}>
          <div><button type="button" className="secondary-action close-detail" onClick={() => setDetailRow(undefined)}>Close</button><h2 id="row-detail-title">Age {detailRow.age} calculation</h2><p>Starting Taxable: {currency.format(detailRow.startTaxable)}.</p><p>Starting Retirement: {currency.format(detailRow.startRetirement)}.</p><p>Taxable contribution: {currency.format(detailRow.taxableContribution)}.</p><p>Retirement contribution: {currency.format(detailRow.retirementContribution)}.</p><p>Social Security: {currency.format(detailRow.socialSecurity)}.</p><p>Planned withdrawal: {currency.format(detailRow.expense)}.</p><p>Need = max(0, {currency.format(detailRow.expense)} withdrawal − {currency.format(detailRow.socialSecurity)} Social Security).</p><p>Taxable withdrawal: {currency.format(detailRow.taxableWithdrawal)}.</p><p>Retirement withdrawal: {currency.format(detailRow.retirementWithdrawal)}.</p><p>Total withdrawal: {currency.format(detailRow.totalWithdrawal)}.</p>{detailRow.age < plan.retirementAge ? <><p>Taxable growth = {currency.format(detailRow.startTaxable)} × {plan.annualRoiPercent}% = {currency.format(detailRow.taxableGrowth)}.</p><p>Retirement growth = {currency.format(detailRow.startRetirement)} × {plan.annualRoiPercent}% = {currency.format(detailRow.retirementGrowth)}.</p><p>Contribution-year ending balances add contributions after annual growth.</p></> : <><p>Taxable growth = ({currency.format(detailRow.startTaxable)} + {currency.format(detailRow.taxableContribution)} − {currency.format(detailRow.taxableWithdrawal)}) × {plan.annualRoiPercent}% = {currency.format(detailRow.taxableGrowth)}.</p><p>Retirement growth = ({currency.format(detailRow.startRetirement)} + {currency.format(detailRow.retirementContribution)} − {currency.format(detailRow.retirementWithdrawal)}) × {plan.annualRoiPercent}% = {currency.format(detailRow.retirementGrowth)}.</p></>}<p>Ending Taxable: {currency.format(detailRow.endTaxable)}.</p><p>Ending Retirement: {currency.format(detailRow.endRetirement)}.</p><p>Ending total: {currency.format(detailRow.totalEnd)}.</p><p>Unmet need: {currency.format(detailRow.unmetNeed)}.</p><p>Status: {statusText(detailRow.status)}.</p><p>Applicable expense changes: {detailRow.applicableExpenseChanges.join(', ') || 'None'}.</p></div>
        </section>
      )}
    </div>
  );
}
