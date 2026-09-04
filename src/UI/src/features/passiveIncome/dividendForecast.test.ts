import { describe, expect, it } from 'vitest';
import type { Holding } from '../../domain/holding';
import { buildAnnualDividendForecast } from './dividendForecast';

const holding = (symbol: string, rate: number | null, quantity = 10): Holding => ({
  id: symbol,
  security: {
    symbol, name: symbol, exchange: 'NYSE', assetType: 'ETF', currency: 'USD', dividendGrowthRate: rate,
    payoutDetails: [{ exDividendDate: '2026-02-01', paymentDate: '2026-02-08', amount: 1, status: 'completed' }],
  },
  accountPositions: [{ accountId: 'account', quantity }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

describe('annual dividend forecast', () => {
  it('compounds each security independently and treats a missing rate as zero', () => {
    const result = buildAnnualDividendForecast([holding('GROW', 0.1), holding('FLAT', null)], 2026, '2026-09-04', 2028);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ year: 2026, amount: 20 });
    expect(result[1].amount).toBeCloseTo(21);
    expect(result[2].amount).toBeCloseTo(22.1);
  });

  it('excludes non-positive quantities and rejects invalid target years', () => {
    expect(buildAnnualDividendForecast([holding('ZERO', 0.1, 0)], 2026, '2026-09-04', 2027)[0].amount).toBe(0);
    expect(buildAnnualDividendForecast([holding('VTI', 0.1)], 2026, '2026-09-04', 2025)).toEqual([]);
  });

  it('rejects a forecast containing an invalid saved growth rate', () => {
    expect(buildAnnualDividendForecast([holding('INVALID', -1.01)], 2026, '2026-09-04', 2027)).toEqual([]);
  });
});
