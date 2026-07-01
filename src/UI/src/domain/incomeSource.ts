export type IncomeSourceType = 'Salary';

export type IncomeCadence = 'Bi-weekly';

export type IncomeSourceStatus = 'Active' | 'Inactive';

export type IncomePeriod = {
  id: string;
  startDate: string;
  endDate?: string;
  yearlyGrossAmount: number;
  netPercentage: number;
};

export type IncomePeriodDraft = {
  id: string;
  startDate: string;
  endDate: string;
  yearlyGrossAmount: string;
  netPercentage: string;
};

export type IncomeSource = {
  id: string;
  name: string;
  type: IncomeSourceType;
  cadence: IncomeCadence;
  periods: IncomePeriod[];
  status: IncomeSourceStatus;
  createdAt: string;
  updatedAt: string;
};

export type IncomeSourceDraft = {
  name: string;
  periods: IncomePeriodDraft[];
  status: IncomeSourceStatus;
};

export type IncomeSourceFilter = 'All' | IncomeSourceStatus;

export const salaryIncomeType: IncomeSourceType = 'Salary';

export const salaryIncomeCadence: IncomeCadence = 'Bi-weekly';

export const emptyIncomePeriodDraft = (): IncomePeriodDraft => ({
  id: crypto.randomUUID(),
  startDate: '',
  endDate: '',
  yearlyGrossAmount: '',
  netPercentage: '',
});

export const emptyIncomeSourceDraft = (): IncomeSourceDraft => ({
  name: '',
  periods: [emptyIncomePeriodDraft()],
  status: 'Active',
});

export const toIncomeSourceDraft = (
  source: IncomeSource,
): IncomeSourceDraft => ({
  name: source.name,
  periods: source.periods.map((period) => ({
    id: period.id,
    startDate: period.startDate,
    endDate: period.endDate ?? '',
    yearlyGrossAmount: String(period.yearlyGrossAmount),
    netPercentage: String(period.netPercentage),
  })),
  status: source.status,
});
