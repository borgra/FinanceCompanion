import { describe, expect, it } from 'vitest';
import type { Holding } from '../../domain/holding';
import { buildPaymentsForYear } from './dividendSchedule';

const holding = (overrides: Partial<Holding['security']> = {}): Holding => ({
  id: 'holding-vti',
  security: {
    symbol: 'VTI', name: 'VTI', exchange: 'NYSE', assetType: 'ETF', currency: 'USD',
    dividendGrowthRate: 0.1,
    payoutDetails: [
      { exDividendDate: '2025-02-15', paymentDate: '2025-02-22', amount: 1, status: 'completed' },
      { exDividendDate: '2025-05-15', paymentDate: '2025-05-22', amount: 1, status: 'completed' },
      { exDividendDate: '2026-02-15', paymentDate: '2026-02-22', amount: 1.1, status: 'completed' },
      { exDividendDate: '2026-05-15', paymentDate: '2026-05-22', amount: 1.2, status: 'announced' },
    ],
    ...overrides,
  },
  accountPositions: [{ accountId: 'account', quantity: 10 }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

describe('dividend schedule', () => {
  it('uses actual and announced current-year facts and projects only missing future cadence slots', () => {
    const payments = buildPaymentsForYear([holding()], 2026, 2026, '2026-03-01');
    expect(payments.map((payment) => [payment.date, payment.kind, payment.amount])).toEqual([
      ['2026-02-22', 'actual', 11],
      ['2026-05-22', 'announced', 12],
    ]);
  });

  it('grows the completed current-year schedule once for next year and preserves defined months', () => {
    const payments = buildPaymentsForYear([holding({ payoutDetails: [
      ...holding().security.payoutDetails!,
      { exDividendDate: '2027-02-15', paymentDate: '2027-02-22', amount: 2, status: 'announced' },
    ] })], 2027, 2026, '2026-03-01');
    expect(payments.find((payment) => payment.date === '2027-02-22')?.amount).toBe(20);
    expect(payments.find((payment) => payment.date === '2027-05-22')?.amount).toBeCloseTo(13.2);
    expect(payments.filter((payment) => payment.date.slice(5, 7) === '02')).toHaveLength(1);
  });

  it('does not double-adjust payouts already persisted on the current share basis', () => {
    const currentBasis = holding({
      dividendResearchAdjustmentBasis: 'current_share_basis',
      corporateActions: [{ id: 'split', effectiveDate: '2026-06-01', type: 'stock_split', oldShares: 1, newShares: 2 }],
      payoutDetails: [{ exDividendDate: '2025-02-15', paymentDate: '2025-02-22', amount: 1, status: 'completed' }],
    });
    expect(buildPaymentsForYear([currentBasis], 2025, 2026, '2026-03-01')[0].perShareAmount).toBe(1);
  });

  it('does not project payments from an invalid saved growth rate', () => {
    const payments = buildPaymentsForYear([
      holding({ dividendGrowthRate: -1.01, payoutDetails: [
        { exDividendDate: '2025-11-15', paymentDate: '2025-11-22', amount: 1 },
      ] }),
    ], 2026, 2026, '2026-03-01');
    expect(payments).toEqual([]);
  });
});
