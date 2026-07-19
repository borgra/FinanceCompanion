export type InvestmentSnapshots = Record<string, Record<string, number>>;

export type MortgageSchedule = {
  houseValue: number;
  startingOutstandingMortgage: number;
  annualInterestRate: number;
  monthlyPrincipalPayment: number;
  monthlyAdditionalPrincipalPayment: number;
  scheduleStartMonth: string;
};

export type NetWorth = {
  beginningNetWorth: number | null;
  investmentSnapshots?: InvestmentSnapshots;
  trackMortgageInNetWorth?: boolean;
  mortgageSchedule?: MortgageSchedule | null;
  updatedAt: string;
};
