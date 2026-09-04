import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../domain/account';
import type { BudgetCategoryWithSubCategories } from '../domain/budget';
import type { Holding } from '../domain/holding';
import type { IncomeSource } from '../domain/incomeSource';
import type { NetWorth } from '../domain/netWorth';
import { createDefaultRetirementPlan, type RetirementPlan } from '../domain/retirementPlan';
import type { Workspace } from '../domain/workspace';
import type { HttpClient } from './httpClient';
import { createWorkspaceSession, type WorkspaceRepositories } from './workspaceSession';

const incomeSource: IncomeSource = {
  id: 'income-1',
  name: 'Salary',
  type: 'Salary',
  cadence: 'Bi-weekly',
  periods: [],
  status: 'Active',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const budgetCategory = {
  id: 'category-1',
  name: 'Housing',
  colorHex: '#fff',
  icon: 'home',
  isEssential: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  subCategories: [],
} satisfies BudgetCategoryWithSubCategories;
const account = { id: 'account-1' } as Account;
const holding = { id: 'holding-1' } as Holding;
const netWorth = {
  beginningNetWorth: 100,
  monthlyAccountValues: {},
  trackMortgageInNetWorth: false,
  mortgageSchedule: null,
  updatedAt: '2026-01-01',
} satisfies NetWorth;
const retirementPlan = {
  ...createDefaultRetirementPlan(),
  updatedAt: '2026-01-01',
} satisfies RetirementPlan;

const loadedWorkspace = (): Workspace => ({
  schemaVersion: 1,
  incomeSources: [],
  budgetCategories: [],
  accounts: [],
  holdings: [],
  netWorth: null,
  retirementPlan: null,
});

type SliceCase = {
  slice: keyof Omit<Workspace, 'schemaVersion'>;
  path: string;
  result: unknown;
  read: (repositories: WorkspaceRepositories) => Promise<unknown>;
};

const sliceCases: SliceCase[] = [
  {
    slice: 'incomeSources',
    path: '/income-sources',
    result: [incomeSource],
    read: (repositories) => repositories.incomeSourceRepository.listIncomeSources(),
  },
  {
    slice: 'budgetCategories',
    path: '/budget/categories',
    result: [budgetCategory],
    read: (repositories) => repositories.budgetRepository.listCategoriesWithSubCategories(),
  },
  {
    slice: 'accounts',
    path: '/accounts',
    result: [account],
    read: (repositories) => repositories.accountRepository.listAccounts(),
  },
  {
    slice: 'holdings',
    path: '/holdings',
    result: [holding],
    read: (repositories) => repositories.holdingRepository.listHoldings(),
  },
  {
    slice: 'netWorth',
    path: '/net-worth',
    result: netWorth,
    read: (repositories) => repositories.netWorthRepository.get(),
  },
  {
    slice: 'retirementPlan',
    path: '/retirement-plan',
    result: retirementPlan,
    read: (repositories) => repositories.retirementPlanRepository.get(),
  },
];

describe('workspace session cache fallbacks', () => {
  it('uses explicit empty and null bootstrap slices without any legacy GET', async () => {
    const get = vi.fn();
    const repositories = createWorkspaceSession(loadedWorkspace(), { get } as unknown as HttpClient);

    await Promise.all(sliceCases.map(({ read }) => read(repositories)));

    expect(get).not.toHaveBeenCalled();
  });

  it.each(sliceCases)('loads and caches an omitted $slice slice', async ({ slice, path, result, read }) => {
    const workspace = loadedWorkspace();
    delete (workspace as unknown as Record<string, unknown>)[slice];
    const get = vi.fn().mockImplementation(async (requestedPath: string) => {
      expect(requestedPath).toBe(path);
      return result;
    });
    const repositories = createWorkspaceSession(workspace, { get } as unknown as HttpClient);

    expect(await read(repositories)).toEqual(result);
    expect(await read(repositories)).toEqual(result);

    expect(get).toHaveBeenCalledOnce();
  });

  it.each(sliceCases)('deduplicates concurrent fallback reads for $slice', async ({ slice, path, result, read }) => {
    const workspace = loadedWorkspace();
    delete (workspace as unknown as Record<string, unknown>)[slice];
    let resolveRequest!: (value: unknown) => void;
    const request = new Promise<unknown>((resolve) => { resolveRequest = resolve; });
    const get = vi.fn().mockImplementation((requestedPath: string) => {
      expect(requestedPath).toBe(path);
      return request;
    });
    const repositories = createWorkspaceSession(workspace, { get } as unknown as HttpClient);

    const first = read(repositories);
    const second = read(repositories);
    expect(get).toHaveBeenCalledOnce();
    resolveRequest(result);

    await expect(first).resolves.toEqual(result);
    await expect(second).resolves.toEqual(result);
  });
});
