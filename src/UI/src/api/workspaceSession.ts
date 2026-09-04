import type { Account } from '../domain/account';
import type { AccountRepository } from '../domain/accountRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import type { Holding } from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';
import type { IncomeSource } from '../domain/incomeSource';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { NetWorth } from '../domain/netWorth';
import type { NetWorthRepository } from '../domain/netWorthRepository';
import type { RetirementPlan } from '../domain/retirementPlan';
import type { RetirementPlanRepository } from '../domain/retirementPlanRepository';
import type { Workspace } from '../domain/workspace';
import { createAccountApiRepository } from './accountApiRepository';
import { createBudgetApiRepository } from './budgetApiRepository';
import { createHoldingApiRepository } from './holdingApiRepository';
import type { HttpClient } from './httpClient';
import { createIncomeSourceApiRepository } from './incomeSourceApiRepository';
import { createNetWorthApiRepository } from './netWorthApiRepository';
import { createRetirementPlanApiRepository } from './retirementPlanApiRepository';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const upsert = <T extends { id: string }>(items: T[], item: T): T[] =>
  items.some((current) => current.id === item.id)
    ? items.map((current) => current.id === item.id ? item : current)
    : [...items, item];

const createArrayReader = <T,>(
  getCached: () => T[] | undefined,
  setCached: (value: T[]) => void,
  load: () => Promise<T[]>,
) => {
  let pending: Promise<T[]> | undefined;
  return async (): Promise<T[]> => {
    const cached = getCached();
    if (cached !== undefined) return clone(cached);
    if (!pending) {
      pending = load().then(
        (value) => {
          const next = clone(value);
          setCached(next);
          return next;
        },
        (error: unknown) => {
          pending = undefined;
          throw error;
        },
      );
    }
    return clone(await pending);
  };
};

const createSingletonReader = <T,>(
  getCached: () => T | null | undefined,
  setCached: (value: T | null) => void,
  load: () => Promise<T | undefined>,
) => {
  let pending: Promise<T | undefined> | undefined;
  return async (): Promise<T | undefined> => {
    const cached = getCached();
    if (cached !== undefined) return cached === null ? undefined : clone(cached);
    if (!pending) {
      pending = load().then(
        (value) => {
          setCached(value === undefined ? null : clone(value));
          return value;
        },
        (error: unknown) => {
          pending = undefined;
          throw error;
        },
      );
    }
    const value = await pending;
    return value === undefined ? undefined : clone(value);
  };
};

export type WorkspaceRepositories = {
  incomeSourceRepository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
  accountRepository: AccountRepository;
  holdingRepository: HoldingRepository;
  netWorthRepository: NetWorthRepository;
  retirementPlanRepository: RetirementPlanRepository;
};

export function createWorkspaceSession(
  initialWorkspace: Workspace,
  client: HttpClient,
): WorkspaceRepositories {
  const state = clone(initialWorkspace);
  const incomeApi = createIncomeSourceApiRepository(client);
  const budgetApi = createBudgetApiRepository(client);
  const accountApi = createAccountApiRepository(client);
  const holdingApi = createHoldingApiRepository(client);
  const netWorthApi = createNetWorthApiRepository(client);
  const retirementApi = createRetirementPlanApiRepository(client);
  const readIncomeSources = createArrayReader(
    () => state.incomeSources,
    (value) => { state.incomeSources = value; },
    incomeApi.listIncomeSources,
  );
  const readBudgetCategories = createArrayReader(
    () => state.budgetCategories,
    (value) => { state.budgetCategories = value; },
    budgetApi.listCategoriesWithSubCategories,
  );
  const readAccounts = createArrayReader(
    () => state.accounts,
    (value) => { state.accounts = value; },
    accountApi.listAccounts,
  );
  const readHoldings = createArrayReader(
    () => state.holdings,
    (value) => { state.holdings = value; },
    holdingApi.listHoldings,
  );
  const readNetWorth = createSingletonReader(
    () => state.netWorth,
    (value) => { state.netWorth = value; },
    netWorthApi.get,
  );
  const readRetirementPlan = createSingletonReader(
    () => state.retirementPlan,
    (value) => { state.retirementPlan = value; },
    retirementApi.get,
  );

  const reconcileIncome = (item: IncomeSource) => {
    state.incomeSources = upsert(state.incomeSources ?? [], clone(item));
    return clone(item);
  };
  const reconcileAccount = (item: Account) => {
    state.accounts = upsert(state.accounts ?? [], clone(item));
    return clone(item);
  };
  const reconcileHolding = (item: Holding) => {
    state.holdings = upsert(state.holdings ?? [], clone(item));
    return clone(item);
  };
  const reconcileHoldings = (items: Holding[]) => {
    items.forEach(reconcileHolding);
    return clone(items);
  };
  const reconcileNetWorth = (item: NetWorth) => {
    state.netWorth = clone(item);
    return clone(item);
  };
  const reconcileRetirementPlan = (item: RetirementPlan) => {
    state.retirementPlan = clone(item);
    return clone(item);
  };

  const incomeSourceRepository: IncomeSourceRepository = {
    listIncomeSources: readIncomeSources,
    createIncomeSource: async (draft) => reconcileIncome(await incomeApi.createIncomeSource(draft)),
    updateIncomeSource: async (id, draft) => reconcileIncome(await incomeApi.updateIncomeSource(id, draft)),
    setIncomeSourceStatus: async (id, status) => reconcileIncome(await incomeApi.setIncomeSourceStatus(id, status)),
  };

  const budgetRepository: BudgetRepository = {
    listCategoriesWithSubCategories: readBudgetCategories,
    createCategory: async (...args) => {
      const saved = await budgetApi.createCategory(...args);
      state.budgetCategories = upsert(state.budgetCategories ?? [], { ...clone(saved), subCategories: [] });
      return clone(saved);
    },
    updateCategory: async (...args) => {
      const saved = await budgetApi.updateCategory(...args);
      state.budgetCategories = (state.budgetCategories ?? []).map((category) =>
        category.id === saved.id ? { ...category, ...clone(saved) } : category,
      );
      return clone(saved);
    },
    saveCategoryDraft: async (draft) => {
      const saved = await budgetApi.saveCategoryDraft(draft);
      state.budgetCategories = upsert(state.budgetCategories ?? [], clone(saved));
      return clone(saved);
    },
    deleteCategory: async (id) => {
      await budgetApi.deleteCategory(id);
      state.budgetCategories = (state.budgetCategories ?? []).filter((category) => category.id !== id);
    },
    createSubCategory: async (...args) => {
      const saved = await budgetApi.createSubCategory(...args);
      state.budgetCategories = (state.budgetCategories ?? []).map((category) =>
        category.id === saved.categoryId
          ? { ...category, subCategories: upsert(category.subCategories, clone(saved)) }
          : category,
      );
      return clone(saved);
    },
    updateSubCategory: async (...args) => {
      const saved = await budgetApi.updateSubCategory(...args);
      state.budgetCategories = (state.budgetCategories ?? []).map((category) =>
        category.id === saved.categoryId
          ? { ...category, subCategories: upsert(category.subCategories, clone(saved)) }
          : category,
      );
      return clone(saved);
    },
    deleteSubCategory: async (id) => {
      await budgetApi.deleteSubCategory(id);
      state.budgetCategories = (state.budgetCategories ?? []).map((category) => ({
        ...category,
        subCategories: category.subCategories.filter((subCategory) => subCategory.id !== id),
      }));
    },
  };

  const accountRepository: AccountRepository = {
    listAccounts: readAccounts,
    createAccount: async (draft) => reconcileAccount(await accountApi.createAccount(draft)),
    updateAccount: async (id, draft) => reconcileAccount(await accountApi.updateAccount(id, draft)),
    updateAccountsBatch: async (changes) => clone(
      (await accountApi.updateAccountsBatch(changes)).map((item) => {
        reconcileAccount(item);
        return item;
      }),
    ),
    deleteAccount: async (id) => {
      await accountApi.deleteAccount(id);
      state.accounts = (state.accounts ?? []).filter((account) => account.id !== id);
    },
  };

  const holdingRepository: HoldingRepository = {
    searchSecurities: holdingApi.searchSecurities,
    listHoldings: readHoldings,
    createHolding: async (draft) => reconcileHolding(await holdingApi.createHolding(draft)),
    updateHolding: async (id, draft) => reconcileHolding(await holdingApi.updateHolding(id, draft)),
    updateHoldingsBatch: async (changes) => reconcileHoldings(await holdingApi.updateHoldingsBatch(changes)),
    importHoldingDetails: async (rows) => {
      const result = await holdingApi.importHoldingDetails!(rows);
      reconcileHoldings(result.holdings);
      return clone(result);
    },
    importManualPayoutDetails: async (rows) => {
      const result = await holdingApi.importManualPayoutDetails!(rows);
      reconcileHoldings(result.holdings);
      return clone(result);
    },
    importCorporateActions: async (rows) => {
      const result = await holdingApi.importCorporateActions!(rows);
      reconcileHoldings(result.holdings);
      return clone(result);
    },
    purgePaymentData: async () => {
      const holdings = await holdingApi.purgePaymentData!();
      state.holdings = clone(holdings);
      return clone(holdings);
    },
    deleteHolding: async (id) => {
      await holdingApi.deleteHolding(id);
      state.holdings = (state.holdings ?? []).filter((holding) => holding.id !== id);
    },
    refreshHoldingSecurityDetails: async (id) => reconcileHolding(await holdingApi.refreshHoldingSecurityDetails(id)),
    refreshHeldSecurityDetails: async () => {
      const result = await holdingApi.refreshHeldSecurityDetails();
      reconcileHoldings(result.holdings);
      return clone(result);
    },
    updateManualPayoutDetails: async (id, payouts) => reconcileHolding(
      await holdingApi.updateManualPayoutDetails(id, payouts),
    ),
  };

  const netWorthRepository: NetWorthRepository = {
    get: readNetWorth,
    put: async (value) => reconcileNetWorth(await netWorthApi.put(value)),
    putMonthlyAccountValues: async (value) => reconcileNetWorth(await netWorthApi.putMonthlyAccountValues(value)),
    putConfiguration: async (value) => reconcileNetWorth(await netWorthApi.putConfiguration!(value)),
    putMortgageSchedule: async (value) => reconcileNetWorth(await netWorthApi.putMortgageSchedule!(value)),
    deleteMortgageSchedule: async () => reconcileNetWorth(await netWorthApi.deleteMortgageSchedule!()),
  };

  const retirementPlanRepository: RetirementPlanRepository = {
    get: readRetirementPlan,
    put: async (value) => reconcileRetirementPlan(await retirementApi.put(value)),
  };

  return {
    incomeSourceRepository,
    budgetRepository,
    accountRepository,
    holdingRepository,
    netWorthRepository,
    retirementPlanRepository,
  };
}
