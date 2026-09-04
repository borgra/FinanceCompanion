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
});
