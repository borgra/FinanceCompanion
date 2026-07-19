import type { BudgetCategory, BudgetCategoryWithSubCategories, BudgetSubCategory } from '../domain/budget';
import type { BudgetRepository } from '../domain/budgetRepository';
import { HttpClient } from './httpClient';

export const createBudgetApiRepository = (client: HttpClient): BudgetRepository => ({
  listCategoriesWithSubCategories: () => client.get<BudgetCategoryWithSubCategories[]>('/budget/categories'),
  createCategory: (name: string, colorHex: string, icon: string, isEssential: boolean) =>
    client.post<BudgetCategory>('/budget/categories', { name, colorHex, icon, isEssential }),
  updateCategory: (id: string, name: string, colorHex: string, icon: string, isEssential: boolean) =>
    client.put<BudgetCategory>(`/budget/categories/${id}`, { name, colorHex, icon, isEssential }),
  saveCategoryDraft: (draft) => client.put<BudgetCategoryWithSubCategories>(`/budget/categories/${draft.id}/draft`, {
    name: draft.name,
    colorHex: draft.colorHex,
    icon: draft.icon,
    isEssential: draft.isEssential,
    subCategories: draft.subCategories.map((sub) => ({
      ...(sub.id.startsWith('tmp-') ? {} : { id: sub.id }),
      name: sub.name,
      monthlyAmountUsd: sub.monthlyAmountUsd,
    })),
  }),  deleteCategory: (id: string) => client.delete(`/budget/categories/${id}`),
  createSubCategory: (categoryId: string, name: string, monthlyAmountUsd: number) =>
    client.post<BudgetSubCategory>('/budget/sub-categories', { categoryId, name, monthlyAmountUsd }),
  updateSubCategory: (id: string, name: string, monthlyAmountUsd: number) =>
    client.put<BudgetSubCategory>(`/budget/sub-categories/${id}`, { name, monthlyAmountUsd }),
  deleteSubCategory: (id: string) => client.delete(`/budget/sub-categories/${id}`),
});

