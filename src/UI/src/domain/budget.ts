export type BudgetCategory = {
  id: string;
  name: string;
  colorHex: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
};

export type BudgetSubCategory = {
  id: string;
  categoryId: string;
  name: string;
  monthlyAmountUsd: number;
  createdAt: string;
  updatedAt: string;
};

export type BudgetCategoryWithSubCategories = BudgetCategory & {
  subCategories: BudgetSubCategory[];
};

export type BudgetCategoryDraft = {
  id?: string;
  name: string;
  colorHex: string;
  icon: string;
};

export type BudgetSubCategoryDraft = {
  id?: string;
  categoryId: string;
  name: string;
  monthlyAmountUsd: string;
};
