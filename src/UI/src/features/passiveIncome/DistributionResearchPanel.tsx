import { useState } from 'react';
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

export function DistributionResearchPanel({ holdings, repository, onRefreshed }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [failures, setFailures] = useState<string[]>([]);
  const [failureDetails, setFailureDetails] = useState<string[]>([]);
  const [reloadError, setReloadError] = useState(false);
  const securities = holdings.filter((holding, index, all) =>
    holding.security.assetType !== 'Cash' && totalQuantity(holding) > 0
    && all.findIndex((item) => totalQuantity(item) > 0 && item.security.symbol.toUpperCase() === holding.security.symbol.toUpperCase()
      && item.security.exchange.toUpperCase() === holding.security.exchange.toUpperCase()) === index);

  const refresh = async (targets = securities) => {
    setRefreshing(true);
    setFailures([]);
    setFailureDetails([]);
    setReloadError(false);
    setMessage(`Researching 0 of ${targets.length} securities…`);
    // Web research can take longer than a normal API call. Keep requests bounded
    // and announce progress as each security completes.
    const results: PromiseSettledResult<void>[] = new Array(targets.length);
    let next = 0;
    let completed = 0;
    const worker = async () => {
      while (next < targets.length) {
        const index = next++;
        try {
          await repository.refreshHoldingDividends(targets[index].id);
          results[index] = { status: 'fulfilled', value: undefined };
        } catch (reason) { results[index] = { status: 'rejected', reason }; }
        completed++;
        setMessage(`Researched ${completed} of ${targets.length} securities…`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, worker));
    const failed = results.flatMap((result, index) => result.status === 'rejected' ? [targets[index].security.symbol] : []);
    setFailures(failed);
    setFailureDetails(results.flatMap((result, index) => result.status === 'rejected' && result.reason instanceof ApiError ? [`${targets[index].security.symbol}: ${result.reason.message}`] : []));
    try { onRefreshed(await (repository.reloadHoldings ?? repository.listHoldings)()); }
    catch { setReloadError(true); }
    setMessage(`${results.length - failed.length} of ${results.length} securities refreshed.`);
    setRefreshing(false);
  };

  return <section className="distribution-research" aria-label="Distribution research">
    <div className="passive-income-section-heading">
      <p>Ex-date calendar. Income uses today’s share quantities; historical ownership is unavailable. Forecasts are estimates and are not guaranteed.</p>
      <button type="button" className="secondary-action" onClick={() => void refresh()} disabled={refreshing || !securities.length} aria-busy={refreshing}>{refreshing ? 'Refreshing distribution data…' : failures.length || reloadError ? 'Retry distribution refresh' : 'Refresh distribution data'}</button>
    </div>
    <p className="status-copy" role="status">{message}</p>
    {failures.length ? <p className="form-error" role="alert">Distribution refresh failed for {failures.join(', ')}. Existing data is still shown. Retry to check the provider or configuration again.</p> : null}
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
          {url ? <a href={url} target="_blank" rel="noreferrer">{security.symbol} research source</a> : null}
          {(security.dividendResearchWarnings ?? []).map((warning, index) => <span key={index}>{warning}</span>)}
          <SavedWebResearch evidence={security.dividendResearchSnapshot?.evidence} />
        </li>;
      })}</ul>
    </details> : <p className="status-copy">Add a non-cash holding with a positive quantity to research distributions.</p>}
  </section>;
}
