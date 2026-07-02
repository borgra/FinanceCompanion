import type {
  BudgetCategory,
  BudgetCategoryWithSubCategories,
  BudgetSubCategory,
} from './budget';

export type BudgetRepository = {
  listCategoriesWithSubCategories: () => Promise<BudgetCategoryWithSubCategories[]>;
  createCategory: (name: string, colorHex: string) => Promise<BudgetCategory>;
  updateCategory: (id: string, name: string, colorHex: string) => Promise<BudgetCategory>;
  deleteCategory: (id: string) => Promise<void>;

  createSubCategory: (
    categoryId: string,
    name: string,
    monthlyAmountUsd: number,
  ) => Promise<BudgetSubCategory>;
  updateSubCategory: (
    id: string,
    name: string,
    monthlyAmountUsd: number,
  ) => Promise<BudgetSubCategory>;
  deleteSubCategory: (id: string) => Promise<void>;
};

const nowIso = () => new Date().toISOString();

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const seedCategories = (): BudgetCategory[] => [
  {
    id: 'cat-housing',
    name: 'Housing',
    colorHex: '#4de3ff',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'cat-utilities',
    name: 'Utilities',
    colorHex: '#9d7bff',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'cat-groceries',
    name: 'Groceries',
    colorHex: '#ffd06a',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'cat-transport',
    name: 'Transportation',
    colorHex: '#5cff9a',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'cat-health',
    name: 'Healthcare',
    colorHex: '#ff6db1',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'cat-lifestyle',
    name: 'Lifestyle',
    colorHex: '#ff8f4d',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
];

const seedSubCategories = (): BudgetSubCategory[] => [
  {
    id: 'sub-house',
    categoryId: 'cat-housing',
    name: 'Rent',
    monthlyAmountUsd: 1350,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-hoa',
    categoryId: 'cat-housing',
    name: 'HOA',
    monthlyAmountUsd: 100,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-electric',
    categoryId: 'cat-utilities',
    name: 'Electricity',
    monthlyAmountUsd: 90,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-internet',
    categoryId: 'cat-utilities',
    name: 'Internet',
    monthlyAmountUsd: 70,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-water',
    categoryId: 'cat-utilities',
    name: 'Water',
    monthlyAmountUsd: 30,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-groceries',
    categoryId: 'cat-groceries',
    name: 'Groceries',
    monthlyAmountUsd: 450,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-household',
    categoryId: 'cat-groceries',
    name: 'Household',
    monthlyAmountUsd: 80,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-gas',
    categoryId: 'cat-transport',
    name: 'Gas',
    monthlyAmountUsd: 150,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-transit',
    categoryId: 'cat-transport',
    name: 'Transit',
    monthlyAmountUsd: 60,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-insurance',
    categoryId: 'cat-health',
    name: 'Insurance',
    monthlyAmountUsd: 200,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-meds',
    categoryId: 'cat-health',
    name: 'Meds',
    monthlyAmountUsd: 40,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-dining',
    categoryId: 'cat-lifestyle',
    name: 'Dining',
    monthlyAmountUsd: 160,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'sub-entertain',
    categoryId: 'cat-lifestyle',
    name: 'Entertainment',
    monthlyAmountUsd: 120,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
];

export function createMockBudgetRepository(): BudgetRepository {
  let categories = seedCategories();
  let subCategories = seedSubCategories();

  const listCategoriesWithSubCategories = async () => {
    const byCategoryId = new Map<string, BudgetSubCategory[]>();
    for (const sub of subCategories) {
      const existing = byCategoryId.get(sub.categoryId);
      if (existing) existing.push(sub);
      else byCategoryId.set(sub.categoryId, [sub]);
    }

    const result: Array<BudgetCategoryWithSubCategories> = categories.map((cat) => ({
      ...clone(cat),
      subCategories: (byCategoryId.get(cat.id) ?? []).map((s) => clone(s)),
    }));

    result.forEach((cat) => {
      cat.subCategories.sort((a, b) => a.name.localeCompare(b.name));
    });

    return clone(result);
  };

  const createCategory = async (name: string, colorHex: string) => {
    const timestamp = nowIso();
    const next: BudgetCategory = {
      id: `cat-${crypto.randomUUID()}`,
      name,
      colorHex,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    categories = [...categories, next];
    return clone(next);
  };

  const updateCategory = async (id: string, name: string, colorHex: string) => {
    const timestamp = nowIso();
    const existing = categories.find((c) => c.id === id);
    if (!existing) {
      throw new Error('Category not found.');
    }
    const updated = { ...existing, name, colorHex, updatedAt: timestamp };
    categories = categories.map((c) => (c.id === id ? updated : c));
    return clone(updated);
  };

  const deleteCategory = async (id: string) => {
    const catExists = categories.some((c) => c.id === id);
    if (!catExists) return;
    categories = categories.filter((c) => c.id !== id);
    subCategories = subCategories.filter((s) => s.categoryId !== id);
  };

  const createSubCategory = async (
    categoryId: string,
    name: string,
    monthlyAmountUsd: number,
  ) => {
    const timestamp = nowIso();
    const next: BudgetSubCategory = {
      id: `sub-${crypto.randomUUID()}`,
      categoryId,
      name,
      monthlyAmountUsd,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    subCategories = [...subCategories, next];
    return clone(next);
  };

  const updateSubCategory = async (
    id: string,
    name: string,
    monthlyAmountUsd: number,
  ) => {
    const timestamp = nowIso();
    const existing = subCategories.find((s) => s.id === id);
    if (!existing) {
      throw new Error('Sub-category not found.');
    }
    const updated = { ...existing, name, monthlyAmountUsd, updatedAt: timestamp };
    subCategories = subCategories.map((s) => (s.id === id ? updated : s));
    return clone(updated);
  };

  const deleteSubCategory = async (id: string) => {
    subCategories = subCategories.filter((s) => s.id !== id);
  };

  return {
    listCategoriesWithSubCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    createSubCategory,
    updateSubCategory,
    deleteSubCategory,
  };
}
