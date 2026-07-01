import type {
  IncomeSource,
  IncomeSourceDraft,
  IncomeSourceStatus,
} from './incomeSource';
import { salaryIncomeCadence, salaryIncomeType } from './incomeSource';

export type IncomeSourceRepository = {
  listIncomeSources: () => Promise<IncomeSource[]>;
  createIncomeSource: (draft: IncomeSourceDraft) => Promise<IncomeSource>;
  updateIncomeSource: (
    id: string,
    draft: IncomeSourceDraft,
  ) => Promise<IncomeSource>;
  setIncomeSourceStatus: (
    id: string,
    status: IncomeSourceStatus,
  ) => Promise<IncomeSource>;
};

export type MockIncomeSourceRepositoryOptions = {
  initialSources?: IncomeSource[];
  shouldFail?: () => boolean;
};

const nowIso = () => new Date().toISOString();

const normalizeOptionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const draftToSourceFields = (draft: IncomeSourceDraft) => ({
  name: draft.name.trim(),
  type: salaryIncomeType,
  cadence: salaryIncomeCadence,
  periods: draft.periods
    .map((period) => ({
      id: period.id,
      startDate: period.startDate,
      endDate: normalizeOptionalText(period.endDate),
      yearlyGrossAmount: Number(period.yearlyGrossAmount),
      netPercentage: Number(period.netPercentage),
    }))
    .sort((left, right) => left.startDate.localeCompare(right.startDate)),
  status: draft.status,
});

const cloneSources = (sources: IncomeSource[]) =>
  sources.map((source) => ({ ...source }));

export function createMockIncomeSourceRepository({
  initialSources = [],
  shouldFail = () => false,
}: MockIncomeSourceRepositoryOptions = {}): IncomeSourceRepository {
  let sources = cloneSources(initialSources);
  let nextId = sources.length + 1;

  const commit = async <T>(operation: () => T): Promise<T> => {
    await Promise.resolve();
    if (shouldFail()) {
      throw new Error('Unable to save income source. Try again.');
    }
    return operation();
  };

  return {
    listIncomeSources: async () => cloneSources(sources),

    createIncomeSource: (draft) =>
      commit(() => {
        const timestamp = nowIso();
        const source: IncomeSource = {
          id: `income-source-${nextId}`,
          ...draftToSourceFields(draft),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        nextId += 1;
        sources = [...sources, source];
        return { ...source };
      }),

    updateIncomeSource: (id, draft) =>
      commit(() => {
        const existing = sources.find((source) => source.id === id);
        if (!existing) {
          throw new Error('Income source not found.');
        }

        const updated: IncomeSource = {
          ...existing,
          ...draftToSourceFields(draft),
          updatedAt: nowIso(),
        };
        sources = sources.map((source) => (source.id === id ? updated : source));
        return { ...updated };
      }),

    setIncomeSourceStatus: (id, status) =>
      commit(() => {
        const existing = sources.find((source) => source.id === id);
        if (!existing) {
          throw new Error('Income source not found.');
        }

        const updated = { ...existing, status, updatedAt: nowIso() };
        sources = sources.map((source) => (source.id === id ? updated : source));
        return { ...updated };
      }),
  };
}
