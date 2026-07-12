import type { BudgetCategory, BudgetCategoryWithSubCategories, BudgetSubCategory } from '../domain/budget';
import type { BudgetRepository } from '../domain/budgetRepository';
import { HttpClient } from './httpClient';

export const createBudgetApiRepository = (client: HttpClient): BudgetRepository => ({
  listCategoriesWithSubCategories: () => client.get<BudgetCategoryWithSubCategories[]>('/budget/categories'),
  createCategory: (name: string, colorHex: string, icon: string) =>
    client.post<BudgetCategory>('/budget/categories', { name, colorHex, icon }),
  updateCategory: (id: string, name: string, colorHex: string, icon: string) =>
    client.put<BudgetCategory>(`/budget/categories/${id}`, { name, colorHex, icon }),
  deleteCategory: (id: string) => client.delete(`/budget/categories/${id}`),
  createSubCategory: (categoryId: string, name: string, monthlyAmountUsd: number) =>
    client.post<BudgetSubCategory>('/budget/sub-categories', { categoryId, name, monthlyAmountUsd }),
  updateSubCategory: (id: string, name: string, monthlyAmountUsd: number) =>
    client.put<BudgetSubCategory>(`/budget/sub-categories/${id}`, { name, monthlyAmountUsd }),
  deleteSubCategory: (id: string) => client.delete(`/budget/sub-categories/${id}`),
});
