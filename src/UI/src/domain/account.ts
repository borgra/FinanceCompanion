export type AccountType = 'Checking' | 'Savings';

export type AccountColumn = {
  id: string;
  name: string;
  icon?: string; // e.g. "credit_card"
  isDeleted?: boolean; // soft-delete
};

export type MonthlyRecord = {
  month: string; // e.g. "Jan-26"
  credit: number;
  outflows: Record<string, number>; // key is column id or name
  invest: number;
  savings: number;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
  startDate: string; // YYYY-MM-DD
  yieldRate: number; // APY percentage
  assignedIncomeSourceIds: string[];
  savingsAccountId?: string;
  columns: AccountColumn[];
  monthlyRecords: MonthlyRecord[];
  createdAt: string;
  updatedAt: string;
};

export type AccountDraft = {
  name: string;
  type: AccountType;
  startingBalance: string;
  startDate: string;
  yieldRate: string;
  assignedIncomeSourceIds: string[];
  savingsAccountId: string;
  columns: AccountColumn[];
  monthlyRecords: MonthlyRecord[];
};

export const projectionMonthsList = [
  'Jan-26',
  'Feb-26',
  'Mar-26',
  'Apr-26',
  'May-26',
  'Jun-26',
  'Jul-26',
  'Aug-26',
  'Sep-26',
  'Oct-26',
  'Nov-26',
  'Dec-26',
];

export const defaultMonthlyRecords = (): MonthlyRecord[] =>
  projectionMonthsList.map((month) => ({
    month,
    credit: 0,
    outflows: {},
    invest: 0,
    savings: 0,
  }));

export const emptyAccountDraft = (): AccountDraft => ({
  name: '',
  type: 'Checking',
  startingBalance: '',
  startDate: '2026-01-01',
  yieldRate: '',
  assignedIncomeSourceIds: [],
  savingsAccountId: '',
  columns: [],
  monthlyRecords: defaultMonthlyRecords(),
});

export const toAccountDraft = (account: Account): AccountDraft => ({
  name: account.name,
  type: account.type,
  startingBalance: String(account.startingBalance),
  startDate: account.startDate ?? '2026-01-01',
  yieldRate: account.yieldRate !== undefined ? String(account.yieldRate) : '',
  assignedIncomeSourceIds: [...(account.assignedIncomeSourceIds || [])],
  savingsAccountId: account.savingsAccountId || '',
  columns: (account.columns || []).map((c) => ({ ...c })),
  monthlyRecords: account.monthlyRecords.map((r) => ({
    ...r,
    outflows: { ...r.outflows },
  })),
});
