import { describe, expect, it } from 'vitest';
import { createMockHoldingRepository } from './holdingRepository';

describe('mock holding repository dividend overrides', () => {
  it('preserves distinct same-ex-date source facts when applying one manual override', async () => {
    const repository = createMockHoldingRepository();
    const security = (await repository.searchSecurities('vti'))[0];
    const source = [
      { exDividendDate: '2026-03-01', paymentDate: '2026-03-07', amount: 1, mode: 'source' as const },
      { exDividendDate: '2026-03-01', paymentDate: '2026-03-08', amount: 2, mode: 'source' as const },
    ];
    const holding = await repository.createHolding({
      security: { ...security, payoutDetails: source, sourcePayoutDetails: source },
      accountPositions: [{ accountId: 'brokerage', quantity: 10 }],
    });

    const updated = await repository.updateManualPayoutDetails(holding.id, [{
      exDividendDate: '2026-03-01',
      paymentDate: '2026-03-07',
      amount: 9.99,
      mode: 'manual',
    }]);

    expect(updated.security.payoutDetails).toHaveLength(2);
    expect(updated.security.payoutDetails?.map((payout) => [payout.paymentDate, payout.amount])).toEqual([
      ['2026-03-07', 9.99],
      ['2026-03-08', 2],
    ]);
  });

  it('leaves Cash untouched for direct security, dividend, and bulk refreshes', async () => {
    const repository = createMockHoldingRepository();
    const cash = await repository.createHolding({
      security: {
        symbol: 'CASH', name: 'Cash', exchange: 'Cash', assetType: 'Cash', currency: 'USD', price: 1,
        detailsUpdatedAt: '2020-01-01T00:00:00Z',
      },
      accountPositions: [{ accountId: 'brokerage', quantity: 50 }],
    });

    await expect(repository.refreshHoldingSecurityDetails(cash.id)).resolves.toEqual(cash);
    await expect(repository.refreshHoldingDividends(cash.id)).resolves.toEqual(cash);
    await expect(repository.refreshHeldSecurityDetails()).resolves.toEqual({
      holdings: [cash],
      failedSymbols: [],
    });
  });
});
