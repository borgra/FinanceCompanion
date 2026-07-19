import type {
  Holding,
  HoldingDraft,
  HoldingImportResult,
  HoldingImportRow,
  PassiveIncomeImportRow,
  SecurityDetailsRefreshResult,
  SecurityMetadata,
} from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';
import { HttpClient } from './httpClient';

export const createHoldingApiRepository = (client: HttpClient): HoldingRepository => ({
  searchSecurities: (query) =>
    client.get<SecurityMetadata[]>(`/securities/search?q=${encodeURIComponent(query)}`),
  listHoldings: () => client.get<Holding[]>('/holdings'),
  createHolding: (draft: HoldingDraft) => client.post<Holding>('/holdings', draft),
  updateHolding: (id: string, draft: HoldingDraft) =>
    client.put<Holding>(`/holdings/${id}`, draft),
  updateHoldingsBatch: (changes) => client.put<Holding[]>('/holdings/batch', {
    holdings: changes.map(({ id, draft }) => ({ id, ...draft })),
  }),  importHoldingDetails: (rows: HoldingImportRow[]) => client.put<HoldingImportResult>("/holdings/import", { rows }),
  importManualPayoutDetails: (rows: PassiveIncomeImportRow[]) =>
    client.put<HoldingImportResult>('/holdings/manual-payouts/import', { rows }),
  purgePaymentData: () => client.delete<Holding[]>('/holdings/payouts'),
  deleteHolding: (id: string) => client.delete(`/holdings/${id}`),
  refreshHoldingSecurityDetails: (id: string, options) =>
    client.post<Holding>(`/holdings/${id}/security-details/refresh`, options ?? {}),
  refreshHeldSecurityDetails: (options) =>
    client.post<SecurityDetailsRefreshResult>('/holdings/security-details/refresh', options ?? {}),
  updateManualPayoutDetails: (id, payouts) =>
    client.put<Holding>(`/holdings/${id}/manual-payouts`, { manualPayoutDetails: payouts }),
});


