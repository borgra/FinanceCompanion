import type { InvestmentSnapshots, MortgageSchedule, NetWorth } from './netWorth';

export type NetWorthRepository = {
  get: () => Promise<NetWorth | undefined>;
  put: (beginningNetWorth: number) => Promise<NetWorth>;
  putInvestmentSnapshots: (investmentSnapshots: InvestmentSnapshots) => Promise<NetWorth>;
  putConfiguration?: (trackMortgageInNetWorth: boolean) => Promise<NetWorth>;
  putMortgageSchedule?: (mortgageSchedule: MortgageSchedule) => Promise<NetWorth>;
  deleteMortgageSchedule?: () => Promise<NetWorth>;
};

export const createMockNetWorthRepository = (initialValue?: number): NetWorthRepository => {
  let value: NetWorth | undefined = { beginningNetWorth: initialValue ?? 100000, investmentSnapshots: {}, trackMortgageInNetWorth: true, mortgageSchedule: { houseValue: 800000, startingOutstandingMortgage: 0, annualInterestRate: 0.02875, monthlyPrincipalPayment: 0, monthlyAdditionalPrincipalPayment: 0, scheduleStartMonth: '2026-01' }, updatedAt: '2026-01-01T00:00:00Z' };
  const merge = (next: Partial<NetWorth>): NetWorth => value = { beginningNetWorth: value?.beginningNetWorth ?? 100000, investmentSnapshots: value?.investmentSnapshots ?? {}, trackMortgageInNetWorth: value?.trackMortgageInNetWorth ?? true, mortgageSchedule: value?.mortgageSchedule ?? null, updatedAt: '2026-01-01T00:00:00Z', ...next };
  return {
    get: async () => value,
    put: async (beginningNetWorth) => merge({ beginningNetWorth }),
    putInvestmentSnapshots: async (investmentSnapshots) => merge({ investmentSnapshots }),
    putConfiguration: async (trackMortgageInNetWorth) => merge({ trackMortgageInNetWorth }),
    putMortgageSchedule: async (mortgageSchedule) => merge({ mortgageSchedule }),
    deleteMortgageSchedule: async () => merge({ mortgageSchedule: null }),
  };
};



