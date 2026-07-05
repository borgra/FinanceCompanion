import type { Account, AccountDraft } from '../domain/account';
import type { AccountRepository } from '../domain/accountRepository';
import { HttpClient } from './httpClient';

const draftToPayload = (draft: AccountDraft) => ({
  name: draft.name.trim(),
  type: draft.type,
  startingBalance: Number(draft.startingBalance) || 0,
  startDate: draft.startDate,
  yieldRate: Number(draft.yieldRate) || 0,
  columns: draft.columns,
  monthlyRecords: draft.monthlyRecords,
});

export const createAccountApiRepository = (client: HttpClient): AccountRepository => ({
  listAccounts: () => client.get<Account[]>('/accounts'),
  createAccount: (draft) => client.post<Account>('/accounts', {
    name: draft.name.trim(),
    type: draft.type,
    startingBalance: Number(draft.startingBalance) || 0,
    startDate: draft.startDate,
    yieldRate: Number(draft.yieldRate) || 0,
  }),
  updateAccount: (id, draft) => client.put<Account>(`/accounts/${id}`, draftToPayload(draft)),
  deleteAccount: (id) => client.delete(`/accounts/${id}`),
});
