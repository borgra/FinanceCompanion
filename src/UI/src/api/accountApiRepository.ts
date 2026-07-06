import type { Account, AccountDraft } from '../domain/account';
import type { AccountRepository } from '../domain/accountRepository';
import { HttpClient } from './httpClient';

const draftToPayload = (draft: AccountDraft) => ({
  name: draft.name.trim(),
  type: draft.type,
  startingBalance: Number(draft.startingBalance) || 0,
  startDate: draft.startDate,
  yieldRate: Number(draft.yieldRate) || 0,
  assignedIncomeSourceIds: draft.assignedIncomeSourceIds,
  savingsAccountId: draft.savingsAccountId ? draft.savingsAccountId : null,
  investmentAccountType:
    draft.type === 'Investment' ? draft.investmentAccountType : null,
  investmentBrokerage:
    draft.type === 'Investment' ? draft.investmentBrokerage : null,
  yearlyContribution:
    draft.type === 'Investment' ? Number(draft.yearlyContribution) || 0 : null,
  employerIncomeSourceId:
    draft.type === 'Investment' && draft.employerIncomeSourceId
      ? draft.employerIncomeSourceId
      : null,
  employerMatchRatePercent:
    draft.type === 'Investment' ? Number(draft.employerMatchRatePercent) || 0 : null,
  employerMatchCapPercent:
    draft.type === 'Investment' ? Number(draft.employerMatchCapPercent) || 0 : null,
  employerMatchStartDate:
    draft.type === 'Investment' && draft.employerMatchStartDate
      ? draft.employerMatchStartDate
      : null,
  employerMatchAmount:
    draft.type === 'Investment' ? Number(draft.employerMatchAmount) || 0 : null,
  employerMatchPercent:
    draft.type === 'Investment' ? Number(draft.employerMatchPercent) || 0 : null,
  columns: draft.columns,
  monthlyRecords: draft.monthlyRecords,
});

export const createAccountApiRepository = (client: HttpClient): AccountRepository => ({
  listAccounts: () => client.get<Account[]>('/accounts'),
  createAccount: (draft) => client.post<Account>('/accounts', draftToPayload(draft)),
  updateAccount: (id, draft) => client.put<Account>(`/accounts/${id}`, draftToPayload(draft)),
  deleteAccount: (id) => client.delete(`/accounts/${id}`),
});
