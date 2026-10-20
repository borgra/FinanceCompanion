import { FinanceTable } from '../../components/FinanceTable';
import type { DividendPayment } from './dividendSchedule';

const statusLabels = { actual: 'Actual', announced: 'Announced', projected: 'Projected' };
const typeLabels: Record<string, string> = { income: 'Income', capital_gain: 'Capital gain', return_of_capital: 'Return of capital', other: 'Other' };

export function DistributionPaymentsTable({ payments, month }: { payments: DividendPayment[]; month: string }) {
  return <FinanceTable variant="plain" wrapperClassName="distribution-table-scroll" className="distribution-payments-table">
    <caption>{month} distribution details</caption>
    <thead><tr><th scope="col">Ex-date</th><th scope="col">Holding / distribution</th><th scope="col">Per share</th><th scope="col">Shares</th><th scope="col">Holding income</th></tr></thead>
    <tbody>{payments.map((payment) => {
      const perShare = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: payment.currency, maximumFractionDigits: 6 }).format(amount);
      const income = new Intl.NumberFormat('en-US', { style: 'currency', currency: payment.currency }).format(payment.amount);
      return <tr key={payment.id} className={payment.isEstimate ? 'passive-income-payment-estimate' : undefined}>
        <td>{payment.date}{payment.paymentDate ? <small>Pay date: {payment.paymentDate}</small> : <small>Pay date unavailable</small>}</td>
        <th scope="row"><strong>{payment.symbol}</strong><small>{payment.holdingName}</small><small>{statusLabels[payment.kind]} · {typeLabels[payment.distributionType] ?? payment.distributionType}</small>
          {payment.isManual ? <small>User-entered</small> : payment.sourceUrl ? <a href={payment.sourceUrl} target="_blank" rel="noreferrer">{payment.symbol} distribution source</a> : <small>{payment.kind === 'projected' ? 'Based on researched history' : 'Source unavailable'}</small>}
          {payment.forecastMethod ? <small>Method: {payment.forecastMethod} · estimated date and amount</small> : null}
          {payment.regularityBasis === 'inferred_cadence_v1' ? <small>Recurring schedule inferred from history; distribution tax type is unclassified.</small> : null}
          {payment.forecastRange ? <small>Historical scenario range: {perShare(Number(payment.forecastRange.min))}–{perShare(Number(payment.forecastRange.max))}; not a confidence interval</small> : null}
          {payment.isSplitAdjusted ? <small>Split-adjusted from {perShare(payment.rawPerShareAmount)} per share</small> : null}
          {payment.shareBasis ? <small>Share basis: {payment.shareBasis}</small> : null}
        </th>
        <td>{perShare(payment.perShareAmount)} <small>{payment.currency}</small></td>
        <td>{new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(payment.quantity)}</td>
        <td>{income}</td>
      </tr>;
    })}</tbody>
  </FinanceTable>;
}
