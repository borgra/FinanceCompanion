import type { IncomeSource, IncomeSourceDraft } from '../../domain/incomeSource';

export type IncomeSourceFormErrors = Partial<
  Record<'name' | 'periods', string>
>;

export type IncomePeriodFormErrors = Partial<
  Record<'startDate' | 'endDate' | 'yearlyGrossAmount' | 'netPercentage', string>
>;

export type IncomeSourceValidationResult = {
  sourceErrors: IncomeSourceFormErrors;
  periodErrors: IncomePeriodFormErrors[];
};

export function validateIncomeSourceDraft(
  draft: IncomeSourceDraft,
): IncomeSourceValidationResult {
  const sourceErrors: IncomeSourceFormErrors = {};
  const periodErrors = draft.periods.map<IncomePeriodFormErrors>(() => ({}));

  if (draft.name.trim().length === 0) {
    sourceErrors.name = 'Enter a source name.';
  }

  if (draft.periods.length === 0) {
    sourceErrors.periods = 'Add at least one income period.';
  }

  draft.periods.forEach((period, index) => {
    if (!period.startDate) {
      periodErrors[index].startDate = 'Enter a start date.';
    }

    if (period.endDate && period.startDate && period.endDate < period.startDate) {
      periodErrors[index].endDate = 'End date must be after start date.';
    }

    const yearlyGrossAmount = Number(period.yearlyGrossAmount);
    if (!Number.isFinite(yearlyGrossAmount) || yearlyGrossAmount <= 0) {
      periodErrors[index].yearlyGrossAmount =
        'Enter a positive yearly gross amount.';
    }

    const netPercentage = Number(period.netPercentage);
    if (
      !Number.isFinite(netPercentage) ||
      netPercentage <= 0 ||
      netPercentage > 100
    ) {
      periodErrors[index].netPercentage =
        'Enter a net percentage from 1 to 100.';
    }
  });

  draft.periods.forEach((period, index) => {
    if (!period.startDate) {
      return;
    }

    draft.periods.forEach((comparison, comparisonIndex) => {
      if (comparisonIndex <= index || !comparison.startDate) {
        return;
      }

      if (periodsOverlap(period, comparison)) {
        periodErrors[index].endDate =
          periodErrors[index].endDate ??
          'Periods cannot overlap for the same source.';
        periodErrors[comparisonIndex].startDate =
          periodErrors[comparisonIndex].startDate ??
          'Periods cannot overlap for the same source.';
      }
    });
  });

  return { sourceErrors, periodErrors };
}

export function hasValidationErrors(result: IncomeSourceValidationResult) {
  return (
    Object.keys(result.sourceErrors).length > 0 ||
    result.periodErrors.some((errors) => Object.keys(errors).length > 0)
  );
}

export function hasDuplicateNameWarning(
  draft: IncomeSourceDraft,
  sources: IncomeSource[],
  editingId?: string,
) {
  const normalizedName = draft.name.trim().toLocaleLowerCase();
  if (normalizedName.length === 0) {
    return false;
  }

  return sources.some(
    (source) =>
      source.id !== editingId &&
      source.name.trim().toLocaleLowerCase() === normalizedName,
  );
}

type PeriodRange = {
  startDate: string;
  endDate: string;
};

const maxOpenEndDate = '9999-12-31';

function periodsOverlap(left: PeriodRange, right: PeriodRange) {
  const leftEnd = left.endDate || maxOpenEndDate;
  const rightEnd = right.endDate || maxOpenEndDate;
  return left.startDate <= rightEnd && right.startDate <= leftEnd;
}
