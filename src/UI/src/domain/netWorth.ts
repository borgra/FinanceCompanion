export type InvestmentSnapshots = Record<string, Record<string, number>>;
export type SnapshotAccountValue = {
  accountName: string;
  value: number;
};

export type MonthlyNetWorthSnapshot = {
  asOfDate: string;
  accountValues: Record<string, SnapshotAccountValue>;
  homeEquity?: number;
};

export type MonthlyNetWorthSnapshots = Record<string, MonthlyNetWorthSnapshot>;

export type MortgageSchedule = {
  houseValue: number;
  startingOutstandingMortgage: number;
  annualInterestRate: number;
  monthlyPrincipalPayment: number;
  monthlyAdditionalPrincipalPayment: number;
  scheduleStartMonth: string;
  principalOverrides?: Record<string, number>;
  extraPrincipalOverrides?: Record<string, number>;
};

export type NetWorth = {
  beginningNetWorth: number | null;
  investmentSnapshots?: InvestmentSnapshots;
  trackMortgageInNetWorth?: boolean;
  mortgageSchedule?: MortgageSchedule | null;
  monthlySnapshots?: MonthlyNetWorthSnapshots;
  updatedAt: string;
};

