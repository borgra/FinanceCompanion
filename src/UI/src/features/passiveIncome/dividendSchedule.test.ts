import { describe, expect, it } from 'vitest';
import type { Holding } from '../../domain/holding';
import { buildMonthlyIncome, buildPaymentsForYear, distributionMarketDate, normalizePayoutAmount } from './dividendSchedule';

const holding = (overrides: Partial<Holding['security']> = {}): Holding => ({
  id: 'holding-vti',
  security: {
    symbol: 'VTI', name: 'VTI', exchange: 'NYSE', assetType: 'ETF', currency: 'USD',
    dividendGrowthRate: 0.1,
    payoutDetails: [
      { exDividendDate: '2025-02-15', paymentDate: '2025-02-22', amount: 1, status: 'completed' },
      { exDividendDate: '2026-02-15', paymentDate: '2026-02-22', amount: 1.1, status: 'completed' },
      { exDividendDate: '2026-05-15', paymentDate: '2026-05-22', amount: 1.2, status: 'announced' },
      { exDividendDate: '2026-08-15', amount: 1.15, status: 'projected', forecastMethod: 'seasonal_median_v1' },
      { exDividendDate: '2027-02-15', amount: 1.15, status: 'projected', forecastMethod: 'seasonal_median_v1' },
    ],
    ...overrides,
  },
  accountPositions: [{ accountId: 'account', quantity: 10 }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

describe('dividend schedule', () => {
  it('uses the exchange calendar date at UTC and local year boundaries', () => {
    expect(distributionMarketDate(new Date('2026-01-01T01:00:00Z'))).toBe('2025-12-31');
    expect(distributionMarketDate(new Date('2026-12-31T23:30:00-06:00'))).toBe('2027-01-01');
  });
  it('renders persisted actual, announced and deterministic projected events without applying growth', () => {
    const payments = buildPaymentsForYear([holding()], 2026, 2026, '2026-03-01');
    expect(payments.map((payment) => [payment.date, payment.kind, payment.amount])).toEqual([
      ['2026-02-15', 'actual', 11], ['2026-05-15', 'announced', 12], ['2026-08-15', 'projected', 11.5],
    ]);
    expect(buildPaymentsForYear([holding()], 2027, 2026, '2026-03-01')[0].amount).toBe(11.5);
  });

  it('uses ex-date across month and year boundaries while retaining pay date', () => {
    const months = buildMonthlyIncome([holding({ payoutDetails: [{ exDividendDate: '2025-12-30', paymentDate: '2026-01-06', amount: 1 }] })], 2025, 2026, '2026-03-01');
    expect(months[11].payments[0].paymentDate).toBe('2026-01-06');
    expect(months[0].payments).toEqual([]);
  });

  it('never turns expired projections or unresolved announcements into previous-year actuals', () => {
    const payouts = [
      { exDividendDate: '2025-02-15', amount: 1, status: 'projected' as const },
      { exDividendDate: '2025-05-15', amount: 1, status: 'announced' as const },
      { exDividendDate: '2026-02-15', amount: 1, status: 'projected' as const },
      { exDividendDate: '2026-05-15', amount: 1, status: 'superseded' as const },
    ];
    expect(buildPaymentsForYear([holding({ payoutDetails: payouts })], 2025, 2026, '2026-03-01')).toEqual([]);
    expect(buildPaymentsForYear([holding({ payoutDetails: payouts })], 2026, 2026, '2026-03-01')).toEqual([]);
  });

  it('does not fabricate forecasts from legacy history or a growth rate', () => {
    const legacy = holding({ payoutDetails: [{ exDividendDate: '2025-11-15', amount: 1 }] });
    expect(buildPaymentsForYear([legacy], 2026, 2026, '2026-03-01')).toEqual([]);
  });

  it('does not double-adjust per-event or legacy research amounts and normalizes manual values independently', () => {
    const actions = [{ id: 'split', effectiveDate: '2026-06-01', type: 'stock_split' as const, oldShares: 1, newShares: 4 }];
    expect(normalizePayoutAmount({ exDividendDate: '2025-02-15', amount: 4 }, actions)).toBe(1);
    expect(normalizePayoutAmount({ exDividendDate: '2025-02-15', amount: 1, shareBasis: 'as_of:2026-09-01' }, actions)).toBe(1);
    const currentBasis = holding({ dividendResearchAdjustmentBasis: 'current_share_basis', corporateActions: actions,
      payoutDetails: [
        { exDividendDate: '2025-02-15', amount: 1, status: 'completed', mode: 'source' },
        { exDividendDate: '2025-05-15', amount: 4, status: 'completed', mode: 'manual' },
      ],
    });
    expect(buildPaymentsForYear([currentBasis], 2025, 2026, '2026-09-01').map((payment) => payment.perShareAmount)).toEqual([1, 1]);
  });

  it('retains distinct same-day events and rejects missing or invalid amounts and unsafe source URLs', () => {
    const payments = buildPaymentsForYear([holding({ payoutDetails: [
      { exDividendDate: '2026-02-15', amount: 1, distributionType: 'income', sourceUrl: 'javascript:alert(1)' },
      { exDividendDate: '2026-02-15', amount: 2, distributionType: 'capital_gain' },
      { exDividendDate: '2026-02-15', amount: Number.NaN },
    ] })], 2026, 2026, '2026-03-01');
    expect(payments).toHaveLength(2);
    expect(new Set(payments.map((payment) => payment.id)).size).toBe(2);
    expect(payments[0].sourceUrl).toBeUndefined();
  });

  it('excludes quarantined conflicts and does not apply announced future splits to current quantities', () => {
    const payments = buildPaymentsForYear([holding({ dividendResearchAsOf: '2026-03-01',
      corporateActions: [{ id: 'future-split', effectiveDate: '2027-01-01', type: 'stock_split', oldShares: 1, newShares: 4 }],
      payoutDetails: [
        { exDividendDate: '2026-02-01', amount: 4, mode: 'manual' },
        { exDividendDate: '2026-02-02', amount: 9, excludedFromTotals: true },
      ],
    })], 2026, 2026, '2026-03-01');
    expect(payments).toHaveLength(1);
    expect(payments[0].perShareAmount).toBe(4);
  });
});
