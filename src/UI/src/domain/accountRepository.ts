import { type Account, type AccountDraft, defaultMonthlyRecords } from './account';

export type AccountRepository = {
  listAccounts: () => Promise<Account[]>;
  createAccount: (draft: AccountDraft) => Promise<Account>;
  updateAccount: (id: string, draft: AccountDraft) => Promise<Account>;
  updateAccountsBatch: (changes: Array<{ id: string; draft: AccountDraft }>) => Promise<Account[]>;
  deleteAccount: (id: string) => Promise<void>;
};

export type MockAccountRepositoryOptions = {
  initialAccounts?: Account[];
  shouldFail?: () => boolean;
};

const nowIso = () => new Date().toISOString();

const cloneAccounts = (accounts: Account[]) =>
  accounts.map((account) => ({
    ...account,
    assignedIncomeSourceIds: [...(account.assignedIncomeSourceIds || [])],
    columns: account.columns.map((c) => ({ ...c })),
    monthlyRecords: account.monthlyRecords.map((r) => ({
      ...r,
      outflows: { ...r.outflows },
    })),
  }));

const draftToAccountFields = (draft: AccountDraft) => ({
  name: draft.name.trim(),
  type: draft.type,
  startingBalance: Number(draft.startingBalance) || 0,
  startDate: draft.startDate || '2026-01-01',
  yieldRate: Number(draft.yieldRate) || 0,
  assignedIncomeSourceIds: [...draft.assignedIncomeSourceIds],
  savingsAccountId: draft.savingsAccountId,
  investmentAccountType:
    draft.type === 'Investment' ? draft.investmentAccountType : undefined,
  investmentBrokerage:
    draft.type === 'Investment' ? draft.investmentBrokerage : undefined,
  manageHoldings:
    draft.type === 'Investment' ? draft.manageHoldings : false,
  yearlyContribution:
    draft.type === 'Investment' ? Number(draft.yearlyContribution) || 0 : undefined,
  employerIncomeSourceId:
    draft.type === 'Investment' ? draft.employerIncomeSourceId || undefined : undefined,
  employerMatchRatePercent:
    draft.type === 'Investment' ? Number(draft.employerMatchRatePercent) || 0 : undefined,
  employerMatchCapPercent:
    draft.type === 'Investment' ? Number(draft.employerMatchCapPercent) || 0 : undefined,
  employerMatchStartDate:
    draft.type === 'Investment' ? draft.employerMatchStartDate || undefined : undefined,
  employerMatchAmount:
    draft.type === 'Investment' ? Number(draft.employerMatchAmount) || 0 : undefined,
  employerMatchPercent:
    draft.type === 'Investment' ? Number(draft.employerMatchPercent) || 0 : undefined,
  columns: draft.columns.map((c) => ({ ...c })),
  monthlyRecords: draft.monthlyRecords.map((r) => ({
    month: r.month,
    credit: Number(r.credit) || 0,
    outflows: Object.keys(r.outflows).reduce((acc, key) => {
      acc[key] = Number(r.outflows[key]) || 0;
      return acc;
    }, {} as Record<string, number>),
    invest: Number(r.invest) || 0,
    savings: Number(r.savings) || 0,
  })),
});

export function createMockAccountRepository({
  initialAccounts,
  shouldFail = () => false,
}: MockAccountRepositoryOptions = {}): AccountRepository {
  let accounts: Account[] = initialAccounts ?? [
    {
      id: 'acc-lfcu',
      name: 'Liberty Federal Credit Union',
      type: 'Checking',
      startingBalance: 30564,
      startDate: '2026-01-01',
      yieldRate: 0,
      assignedIncomeSourceIds: ['income-source-primary'],
      columns: [
        { id: 'house', name: 'House', icon: 'home' },
        { id: 'chase', name: 'Chase', icon: 'credit_card' },
        { id: 'amex-p', name: 'Amex - P', icon: 'credit_card' },
        { id: 'amex-c', name: 'Amex - C', icon: 'credit_card' },
        { id: 'rh', name: 'RH', icon: 'trending_up' },
        { id: 'misc', name: 'Misc', icon: 'payments' },
      ],
      monthlyRecords: [
        {
          month: 'Jan-26',
          credit: 11752,
          outflows: { house: 3030, chase: 0, 'amex-p': 3159, 'amex-c': 1293, rh: 1220, misc: 35 },
          invest: 2700,
          savings: 0,
        },
        {
          month: 'Feb-26',
          credit: 10752,
          outflows: { house: 3030, chase: 0, 'amex-p': 3536, 'amex-c': 1700, rh: 1138, misc: -2112 },
          invest: 2700,
          savings: 0,
        },
        {
          month: 'Mar-26',
          credit: 10752,
          outflows: { house: 3030, chase: 0, 'amex-p': 2560, 'amex-c': 1363, rh: 0, misc: -351 },
          invest: 2700,
          savings: 350,
        },
        {
          month: 'Apr-26',
          credit: 18252,
          outflows: { house: 3030, chase: 0, 'amex-p': 9897, 'amex-c': 1427, rh: 0, misc: 10068 },
          invest: 1700,
          savings: 0,
        },
        {
          month: 'May-26',
          credit: 16128,
          outflows: { house: 3030, chase: 0, 'amex-p': 3000, 'amex-c': 1432, rh: 1352, misc: -860 },
          invest: 2700,
          savings: 0,
        },
        {
          month: 'Jun-26',
          credit: 10752,
          outflows: { house: 3030, chase: 1878, 'amex-p': 2457, 'amex-c': 1175, rh: 797, misc: -434 },
          invest: 2700,
          savings: 0,
        },
        {
          month: 'Jul-26',
          credit: 10752,
          outflows: { house: 3030, chase: 0, 'amex-p': 3988, 'amex-c': 1071, rh: 0, misc: 500 },
          invest: 2000,
          savings: 0,
        },
        {
          month: 'Aug-26',
          credit: 10752,
          outflows: { house: 3030, chase: 0, 'amex-p': 3250, 'amex-c': 1500, rh: 1500, misc: 500 },
          invest: 2000,
          savings: 0,
        },
        {
          month: 'Sep-26',
          credit: 10752,
          outflows: { house: 3030, chase: 0, 'amex-p': 3250, 'amex-c': 1500, rh: 1500, misc: 500 },
          invest: 2000,
          savings: 0,
        },
        {
          month: 'Oct-26',
          credit: 16128,
          outflows: { house: 3030, chase: 0, 'amex-p': 3250, 'amex-c': 1500, rh: 1500, misc: 500 },
          invest: 2000,
          savings: 0,
        },
        {
          month: 'Nov-26',
          credit: 10752,
          outflows: { house: 3030, chase: 0, 'amex-p': 3250, 'amex-c': 1500, rh: 1500, misc: 500 },
          invest: 2000,
          savings: 0,
        },
        {
          month: 'Dec-26',
          credit: 10752,
          outflows: { house: 3030, chase: 0, 'amex-p': 3250, 'amex-c': 1500, rh: 1500, misc: 500 },
          invest: 2000,
          savings: 0,
        },
      ],
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    },
    {
      id: 'acc-secondary',
      name: 'Secondary Checking',
      type: 'Checking',
      startingBalance: 5000,
      startDate: '2026-01-01',
      yieldRate: 0,
      assignedIncomeSourceIds: [],
      columns: [
        { id: 'utilities', name: 'Utilities', icon: 'bolt' },
        { id: 'misc', name: 'Misc', icon: 'payments' },
      ],
      monthlyRecords: defaultMonthlyRecords(),
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    },
    {
      id: 'acc-hys',
      name: 'High-Yield Savings',
      type: 'Savings',
      startingBalance: 15000,
      startDate: '2026-01-01',
      yieldRate: 4.5,
      assignedIncomeSourceIds: [],
      columns: [],
      monthlyRecords: defaultMonthlyRecords(),
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    },
  ];

  const commit = async <T>(operation: () => T): Promise<T> => {
    await Promise.resolve();
    if (shouldFail()) {
      throw new Error('Unable to save account. Try again.');
    }
    return operation();
  };

  return {
    listAccounts: async () => cloneAccounts(accounts),

    createAccount: (draft) =>
      commit(() => {
        const timestamp = nowIso();
        const next: Account = {
          id: `acc-${crypto.randomUUID().slice(0, 4)}`,
          ...draftToAccountFields(draft),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        accounts = [...accounts, next];
        return { ...next };
      }),

    updateAccount: (id, draft) =>
      commit(() => {
        const existing = accounts.find((a) => a.id === id);
        if (!existing) {
          throw new Error('Account not found.');
        }
        const updated: Account = {
          ...existing,
          ...draftToAccountFields(draft),
          updatedAt: nowIso(),
        };
        accounts = accounts.map((a) => (a.id === id ? updated : a));
        return { ...updated };
      }),

    updateAccountsBatch: (changes) =>
      commit(() => {
        const ids = changes.map((change) => change.id);
        if (ids.length > 100 || ids.length !== new Set(ids).size || ids.some((id) => !accounts.some((account) => account.id === id))) {
          throw new Error('Unable to save accounts batch.');
        }
        const changedFields = new Map(changes.map((change) => [change.id, draftToAccountFields(change.draft)]));
        const proposed = accounts.map((account) => {
          const fields = changedFields.get(account.id);
          return fields ? { ...account, ...fields, updatedAt: nowIso() } : account;
        });
        const sourceOwners = new Map<string, string>();
        for (const account of proposed) {
          for (const sourceId of new Set(account.assignedIncomeSourceIds)) {
            const owner = sourceOwners.get(sourceId);
            if (owner && owner !== account.id) throw new Error('Income source is already assigned to another account.');
            sourceOwners.set(sourceId, account.id);
          }
        }
        accounts = proposed;
        return cloneAccounts(proposed.filter((account) => changedFields.has(account.id)));
      }),
    deleteAccount: (id) =>
      commit(() => {
        accounts = accounts.filter((a) => a.id !== id);
      }),
  };
}

