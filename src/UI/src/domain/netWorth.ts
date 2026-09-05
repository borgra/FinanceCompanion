export type MonthlyAccountValues = Record<string, Record<string, number>>;

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
  monthlyAccountValues?: MonthlyAccountValues;
  trackMortgageInNetWorth?: boolean;
  mortgageSchedule?: MortgageSchedule | null;
  netWorthGoal?: number;
  updatedAt: string;
};

