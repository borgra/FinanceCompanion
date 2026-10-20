import { describe, expect, it, vi } from 'vitest';
import { createAccountApiRepository } from '../api/accountApiRepository';
import { HttpClient } from '../api/httpClient';
import { emptyAccountDraft, toAccountDraft, type Account } from './account';
import { createMockAccountRepository } from './accountRepository';
import { localMonthCode, minimumPercentage, moneyCents, parseMinimumAmount, sumMoney, totalAccountMinimum } from './accountMinimum';

describe('account minimum money contracts', () => {
  it.each(['', ' ', '0', '0.00', undefined, null])('normalizes %s to no minimum', (input) => {
    expect(parseMinimumAmount(input)).toBeNull();
  });
  it.each(['-1', 'Infinity', 'NaN', '1e2', '1,2,3', '1,000', '.50', '1.', '1.001', '1000000000', '$1', '1 2'])('rejects malformed or invalid money %s', (input) => {
    expect(() => parseMinimumAmount(input)).toThrow();
  });
  it('retains exact cents at the maximum and during aggregation', () => {
    expect(parseMinimumAmount('999999999.99')).toBe(999999999.99);
    expect(parseMinimumAmount(' 0000.01 ')).toBe(0.01);
    expect(sumMoney(0.1, 0.2)).toBe(0.3);
    expect(moneyCents(1.005)).toBe(101n);
    expect(moneyCents(-1.005)).toBe(-101n);
    expect(moneyCents(1e-7)).toBe(0n);
    expect(minimumPercentage(0.01, 999999999.99)).toBe('0%');
    expect(minimumPercentage(1, 3)).toBe('33.3%');
    expect(minimumPercentage(-1, 3)).toBe('-33.3%');
    expect(minimumPercentage(200, 0.01)).toBe('2,000,000%');
  });
  it('aggregates each banking account once and excludes investments and unset values', () => {
    const accounts = [
      { id: 'a', type: 'Checking', minimumAmount: 0.1 },
      { id: 'a', type: 'Checking', minimumAmount: 0.1 },
      { id: 'b', type: 'Savings', minimumAmount: 0.2 },
      { id: 'c', type: 'Savings' },
      { id: 'd', type: 'Investment', minimumAmount: 5000 },
    ] as Account[];
    expect(totalAccountMinimum(accounts)).toBe(0.3);
    expect(localMonthCode(new Date(2027, 0, 1))).toBe('2027-01');
    expect(localMonthCode(new Date(2026, 11, 31))).toBe('2026-12');
  });
  it('roundtrips mock create, unrelated update, batch, zero clear, and legacy defaults', async () => {
    const repository = createMockAccountRepository({ initialAccounts: [] });
    const draft = { ...emptyAccountDraft(), name: 'Checking', minimumAmount: '0.01' };
    const created = await repository.createAccount(draft);
    expect(created.minimumAmount).toBe(0.01);
    const legacyUpdate = { ...toAccountDraft(created), name: 'Renamed' };
    delete legacyUpdate.minimumAmount;
    await repository.updateAccount(created.id, legacyUpdate);
    expect((await repository.listAccounts())[0].minimumAmount).toBe(0.01);
    await repository.updateAccountsBatch([{ id: created.id, draft: legacyUpdate }]);
    expect((await repository.listAccounts())[0].minimumAmount).toBe(0.01);
    await repository.updateAccount(created.id, { ...draft, minimumAmount: '0.00' });
    expect((await repository.listAccounts())[0].minimumAmount).toBeNull();
    const legacy = await repository.createAccount({ ...draft, minimumAmount: undefined });
    expect(toAccountDraft(legacy).minimumAmount).toBe('');
  });
  it('sends canonical minimum values through create/update/batch and omits absent update fields', async () => {
    const client = new HttpClient();
    const post = vi.spyOn(client, 'post').mockResolvedValue({});
    const put = vi.spyOn(client, 'put').mockResolvedValue({});
    const repository = createAccountApiRepository(client);
    const draft = { ...emptyAccountDraft(), name: 'Checking', minimumAmount: '999999999.99' };
    await repository.createAccount(draft);
    expect(post).toHaveBeenCalledWith('/accounts', expect.objectContaining({ minimumAmount: 999999999.99 }));
    await repository.updateAccount('a', { ...draft, minimumAmount: '0' });
    expect(put).toHaveBeenLastCalledWith('/accounts/a', expect.objectContaining({ minimumAmount: null }));
    await repository.updateAccountsBatch([{ id: 'a', draft }]);
    expect(put).toHaveBeenLastCalledWith('/accounts/batch', { accounts: [expect.objectContaining({ id: 'a', minimumAmount: 999999999.99 })] });
    await repository.updateAccount('a', { ...draft, minimumAmount: undefined });
    expect(put.mock.lastCall?.[1]).not.toHaveProperty('minimumAmount');
    expect(() => repository.createAccount({ ...draft, minimumAmount: '-1' })).toThrow();
  });
});
