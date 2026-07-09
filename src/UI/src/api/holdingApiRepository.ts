import type {
  Holding,
  HoldingDraft,
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
  refreshHoldingSecurityDetails: (id: string) =>
    client.post<Holding>(`/holdings/${id}/security-details/refresh`, {}),
  refreshHeldSecurityDetails: () =>
    client.post<SecurityDetailsRefreshResult>('/holdings/security-details/refresh', {}),
});
