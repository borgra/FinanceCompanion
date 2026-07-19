import { ApiError, type HttpClient } from './httpClient';
import type { NetWorth } from '../domain/netWorth';
import type { NetWorthRepository } from '../domain/netWorthRepository';
import { readBeginningNetWorth, writeBeginningNetWorth } from '../domain/netWorthConfiguration';

export const createNetWorthApiRepository = (client: HttpClient): NetWorthRepository => ({
  get: async () => {
    try {
      return await client.get<NetWorth>('/net-worth');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const legacyValue = readBeginningNetWorth();
      if (legacyValue === undefined) return undefined;
      const saved = await client.put<NetWorth>('/net-worth', { beginningNetWorth: legacyValue });
      writeBeginningNetWorth(undefined);
      return saved;
    }
  },
  put: (beginningNetWorth) => client.put<NetWorth>('/net-worth', { beginningNetWorth }),
  putInvestmentSnapshots: (investmentSnapshots) => client.put<NetWorth>(
    '/net-worth/investment-snapshots', { investmentSnapshots },
  ),
  putConfiguration: (trackMortgageInNetWorth) => client.put<NetWorth>('/net-worth/configuration', { trackMortgageInNetWorth }),
  putMortgageSchedule: (mortgageSchedule) => client.put<NetWorth>('/net-worth/mortgage-schedule', mortgageSchedule),
});



