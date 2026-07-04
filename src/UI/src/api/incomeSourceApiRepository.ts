import type { IncomeSource, IncomeSourceDraft, IncomeSourceStatus } from '../domain/incomeSource';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import { HttpClient } from './httpClient';

const draftToPayload = (draft: IncomeSourceDraft) => ({
  name: draft.name.trim(),
  periods: draft.periods.map((period) => ({
    id: period.id,
    startDate: period.startDate,
    endDate: period.endDate.trim() || undefined,
    yearlyGrossAmount: Number(period.yearlyGrossAmount),
    netPercentage: Number(period.netPercentage),
  })),
  status: draft.status,
});

export const createIncomeSourceApiRepository = (client: HttpClient): IncomeSourceRepository => ({
  listIncomeSources: () => client.get<IncomeSource[]>('/income-sources'),
  createIncomeSource: (draft) => client.post<IncomeSource>('/income-sources', draftToPayload(draft)),
  updateIncomeSource: (id, draft) => client.put<IncomeSource>(`/income-sources/${id}`, draftToPayload(draft)),
  setIncomeSourceStatus: (id, status: IncomeSourceStatus) =>
    client.post<IncomeSource>(`/income-sources/${id}/status`, { status }),
});
