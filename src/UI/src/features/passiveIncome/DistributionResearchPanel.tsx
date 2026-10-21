import { useEffect, useRef, useState } from 'react';
import type { Holding } from '../../domain/holding';
import type { HoldingRepository } from '../../domain/holdingRepository';
import { ApiError } from '../../api/httpClient';
import { safeSourceUrl, totalQuantity } from './dividendSchedule';
import { SavedWebResearch } from './SavedWebResearch';

type Props = {
  holdings: Holding[];
  repository: HoldingRepository;
  onRefreshed: (holdings: Holding[]) => void;
};

type RefreshRun = {
  cancelled: boolean;
  timer?: ReturnType<typeof setTimeout>;
  resume?: () => void;
};

export function DistributionResearchPanel({ holdings, repository, onRefreshed }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [failures, setFailures] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [failureDetails, setFailureDetails] = useState<string[]>([]);
  const [reloadError, setReloadError] = useState(false);
  const activeRun = useRef<RefreshRun | null>(null);
  useEffect(() => () => {
    const run = activeRun.current;
    if (!run) return;
    run.cancelled = true;
    clearTimeout(run.timer);
    run.resume?.();
  }, []);
  const securities = holdings.filter((holding) =>
    holding.manageDividends !== false && holding.security.assetType !== 'Cash' && totalQuantity(holding) > 0)
    .filter((holding, index, all) =>
    all.findIndex((item) => item.security.symbol.toUpperCase() === holding.security.symbol.toUpperCase()
      && item.security.exchange.toUpperCase() === holding.security.exchange.toUpperCase()) === index);

  const refresh = async (targets = securities) => {
    if (activeRun.current) return;
    const run: RefreshRun = { cancelled: false };
    activeRun.current = run;
    setRefreshing(true);
    setFailures([]);
    setUnavailable([]);
    setFailureDetails([]);
    setReloadError(false);
    setMessage(`Researching 0 of ${targets.length} securities…`);
    // Leave a full provider cooldown after each completed attempt, including
    // failures, before starting the next security.
    const results: PromiseSettledResult<Holding>[] = new Array(targets.length);
    for (let index = 0; index < targets.length; index++) {
      if (run.cancelled) return;
      setMessage(`Researching ${index} of ${targets.length} securities…`);
      try {
        const holding = await repository.refreshHoldingDividends(targets[index].id);
        results[index] = { status: 'fulfilled', value: holding };
      } catch (reason) { results[index] = { status: 'rejected', reason }; }
      if (run.cancelled) return;
      if (index < targets.length - 1) {
        setMessage(`Researched ${index + 1} of ${targets.length} securities. Waiting 15 seconds before the next security…`);
        await new Promise<void>((resolve) => {
          run.resume = resolve;
          run.timer = setTimeout(resolve, 15_000);
        });
        run.timer = undefined;
        run.resume = undefined;
      }
    }
    if (run.cancelled) return;
    const failed = results.flatMap((result, index) => result.status === 'rejected' ? [targets[index].security.symbol] : []);
    const missing = results.flatMap((result, index) => result.status === 'fulfilled' && result.value.security.dividendResearchStatus === 'unavailable' ? [targets[index].security.symbol] : []);
    setFailures(failed);
    setUnavailable(missing);
    setFailureDetails(results.flatMap((result, index) => result.status === 'rejected' && result.reason instanceof ApiError ? [`${targets[index].security.symbol}: ${result.reason.message}`] : []));
    try {
      const refreshed = await (repository.reloadHoldings ?? repository.listHoldings)();
      if (run.cancelled) return;
      onRefreshed(refreshed);
    } catch {
      if (run.cancelled) return;
      setReloadError(true);
    }
    setMessage(`${results.length - failed.length - missing.length} of ${results.length} securities refreshed.`);
    setRefreshing(false);
    activeRun.current = null;
  };

  return <section className="distribution-research" aria-label="Distribution research">
    <div className="passive-income-section-heading">
      <p>Ex-date calendar. Income uses today’s share quantities; historical ownership is unavailable. Forecasts are estimates and are not guaranteed.</p>
      <button type="button" className="secondary-action" onClick={() => void refresh()} disabled={refreshing || !securities.length} aria-busy={refreshing}>{refreshing ? 'Refreshing distribution data…' : failures.length || unavailable.length || reloadError ? 'Retry distribution refresh' : 'Refresh distribution data'}</button>
    </div>
    <p className="status-copy" role="status">{message}</p>
    {failures.length ? <p className="form-error" role="alert">Distribution refresh failed for {failures.join(', ')}. Existing data is still shown. Retry to check the provider or configuration again.</p> : null}
    {unavailable.length ? <p className="form-error" role="alert">No distributions were imported for {unavailable.join(', ')}. Review Research status and sources for coverage warnings and saved AI research, then retry. Existing records are still shown.</p> : null}
    {failureDetails.length ? <ul className="form-error" aria-label="Distribution provider errors">{failureDetails.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
    {reloadError ? <p className="form-error" role="alert">Refreshed distributions could not be loaded. Existing data is still shown. Retry to load the latest records.</p> : null}
    {holdings.some(({ security }) => security.payoutDetails?.some((payout) => payout.excludedFromTotals)) ? <p className="status-copy">Conflicting or unverified distribution events are excluded from totals. Check research warnings and sources before relying on these totals.</p> : null}
    {securities.some(({ security }) => security.dividendResearchProvider === 'stub') ? <p className="status-copy">Demonstration distribution data is shown for securities using the stub provider. It is not authoritative.</p> : null}
    {securities.some(({ security }) => security.dividendResearchStatus !== 'fresh') ? <p className="status-copy">Some securities have incomplete or unavailable research. Annual totals include available records only; missing amounts are unavailable.</p> : null}
    {securities.some(({ security }) => security.dividendResearchWarnings?.length) ? <p className="status-copy">Research warnings apply. Open Research status and sources for coverage, forecast assumptions, and source limitations.</p> : null}
    {securities.length ? <details><summary>Research status and sources ({securities.length} securities)</summary>
      <ul className="distribution-research-status">{securities.map((holding) => {
        const { id, security } = holding;
        const retrieved = security.dividendResearchRetrievedAt;
        const stale = retrieved && Date.now() - new Date(retrieved).getTime() > 7 * 86400000;
        const url = safeSourceUrl(security.dividendResearchSourceUrl);
        const distributionSources = [...new Set((security.sourcePayoutDetails ?? security.payoutDetails ?? [])
          .filter((payout) => payout.mode !== 'manual' && payout.status !== 'projected' && payout.status !== 'superseded')
          .flatMap((payout) => { const source = safeSourceUrl(payout.sourceUrl); return source ? [source] : []; }))];
        return <li key={id}>
          <strong>{security.symbol} · {security.exchange}</strong>
          <button type="button" className="secondary-action" disabled={refreshing} onClick={() => void refresh([holding])}>Refresh {security.symbol} distributions</button>
          <span>{security.dividendResearchStatus ?? 'Not researched'}{stale ? ' · Stale: refresh recommended' : ''}{security.dividendResearchProvider === 'stub' ? ' · Demonstration data (not authoritative)' : ''}</span>
          <span>{retrieved ? `Last researched: ${retrieved}` : 'Refresh to research distributions and forecasts.'}</span>
          {security.dividendResearchAsOf ? <span>Share basis as of {security.dividendResearchAsOf}</span> : null}
          {security.dividendResearchForecastEnd ? <span>Forecast horizon: {security.dividendResearchForecastEnd}</span> : null}
          {security.dividendResearchStatus === 'unsupported' ? <span>This security is not supported by the research provider.</span> : null}
          {security.dividendResearchStatus === 'unavailable' ? <span>Distribution research is unavailable. Existing records may be incomplete.</span> : null}
          {security.dividendResearchStatus === 'partial' ? <span>Partial coverage; totals may be incomplete.</span> : null}
          {url ? <a href={url} target="_blank" rel="noreferrer">{security.symbol} identity source</a> : null}
          {distributionSources.map((source, index) => <a key={source} href={source} target="_blank" rel="noreferrer">{security.symbol} distribution history source {index + 1}</a>)}
          {(security.dividendResearchWarnings ?? []).map((warning, index) => <span key={index}>{warning}</span>)}
          <SavedWebResearch evidence={security.dividendResearchSnapshot?.evidence} />
        </li>;
      })}</ul>
    </details> : <p className="status-copy">Enable Manage Dividends in security details for a non-cash holding with a positive quantity to research distributions.</p>}
  </section>;
}
