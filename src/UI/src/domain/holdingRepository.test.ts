import { describe, expect, it } from 'vitest';
import { createMockHoldingRepository } from './holdingRepository';

describe('mock holding repository dividend overrides', () => {
  it('persists dividend management, preserves it on legacy updates, and skips disabled research', async () => {
    const repository = createMockHoldingRepository();
    const security = (await repository.searchSecurities('vti'))[0];
    const draft = { security, accountPositions: [{ accountId: 'brokerage', quantity: 10 }] };
    const holding = await repository.createHolding(draft);
    expect(holding.manageDividends).toBe(true);
    const disabled = await repository.updateHolding(holding.id, { ...draft, manageDividends: false });
    await expect(repository.refreshHoldingDividends(holding.id)).resolves.toEqual(disabled);
    expect((await repository.updateHolding(holding.id, draft)).manageDividends).toBe(false);
    expect((await repository.updateHoldingsBatch([{ id: holding.id, draft }]))[0].manageDividends).toBe(false);
    expect((await repository.listHoldings())[0].manageDividends).toBe(false);
    expect((await repository.updateHolding(holding.id, { ...draft, manageDividends: true })).manageDividends).toBe(true);
    expect((await repository.refreshHoldingDividends(holding.id)).security.dividendResearchProvider).toBe('stub');
  });

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
