import { describe, expect, it } from 'vitest';
import type { Account } from '../../domain/account';
import type { Holding, SecurityMetadata } from '../../domain/holding';
import { createDefaultRetirementPlan, type RetirementPlan } from '../../domain/retirementPlan';
import { calculateRetirementProjection, validateRetirementPlan, valueRetirementHoldings } from './calculator';

const account = (id: string, investmentAccountType: Account['investmentAccountType'], type: Account['type'] = 'Investment'): Account => ({
  id, name: id, type, startingBalance: 0, startDate: '2026-01-01', yieldRate: 0,
  assignedIncomeSourceIds: [], investmentAccountType, columns: [], monthlyRecords: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

const holding = (
  symbol: string,
  price: number | null,
  positions: Holding['accountPositions'],
  metadata: Partial<SecurityMetadata> = {},
): Holding => ({
  id: `holding-${symbol}`,
  security: { symbol, name: symbol, exchange: 'NYSE', assetType: 'ETF', currency: 'USD', price, ...metadata },
  accountPositions: positions,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

const planFor = (values: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...createDefaultRetirementPlan(),
  currentAge: 40,
  retirementAge: 60,
  longevityAge: 65,
  annualRoiPercent: 0,
  taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 60 },
  retirementContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 60 },
  socialSecurity: { enabled: false, claimAge: 62, monthlyBenefit: 0, annualColaPercent: 0 },
  ...values,
});

describe('retirement holdings valuation', () => {
  it('groups positions once and derives freshness from the oldest included saved price', () => {
    const snapshot = valueRetirementHoldings(
      [account('taxable', 'Taxable'), account('401k', '401k'), account('ira', 'IRA'), account('hsa', 'HSA')],
      [holding('VTI', 10, [
        { accountId: 'taxable', quantity: 2 }, { accountId: '401k', quantity: 3 },
        { accountId: 'ira', quantity: 4 }, { accountId: 'hsa', quantity: 5 },
      ], { detailsUpdatedAt: '2026-07-25T12:00:00Z' }), holding('VXUS', 5, [{ accountId: 'taxable', quantity: 1 }], { detailsUpdatedAt: '2026-07-26T12:00:00Z' })],
    );
    expect(snapshot).toMatchObject({ taxable: 25, retirement: 70, hsa: 50, isComplete: true });
    expect(snapshot.valuedAt).toBe('2026-07-25T12:00:00.000Z');
  });

  it('excludes and names missing, invalid, non-USD, unknown-account, and unsupported data', () => {
    const snapshot = valueRetirementHoldings(
      [account('taxable', 'Taxable'), account('checking', undefined, 'Checking')],
      [
        holding('MISS', null, [{ accountId: 'taxable', quantity: 1 }]),
        holding('BADPRICE', -1, [{ accountId: 'taxable', quantity: 1 }]),
        holding('BADQTY', 10, [{ accountId: 'taxable', quantity: -1 }]),
        holding('CAD', 10, [{ accountId: 'taxable', quantity: 1 }], { currency: 'CAD' }),
        holding('UNKNOWN', 10, [{ accountId: 'missing', quantity: 1 }]),
        holding('CASH', 10, [{ accountId: 'checking', quantity: 1 }]),
      ],
    );
    expect(snapshot.taxable).toBe(0);
    expect(snapshot.isComplete).toBe(false);
    expect(snapshot.valuedAt).toBeNull();
    expect(snapshot.warnings.map(({ code }) => code)).toEqual([
      'missing_price', 'invalid_price', 'invalid_quantity', 'non_usd_currency', 'unknown_account', 'unsupported_account',
    ]);
  });
});

describe('retirement plan validation', () => {
  it('requires an explicit ROI and validates all rate and whole-age boundaries', () => {
    const invalid = planFor({
      annualRoiPercent: null,
      taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 101, endAge: 40.5 },
      socialSecurity: { enabled: true, claimAge: 61.5, monthlyBenefit: 0, annualColaPercent: -1 },
      expenseChanges: [{ age: 59, percentChange: 0, label: 'x'.repeat(121) }],
    });
    expect(validateRetirementPlan(invalid)).toMatchObject({
      annualRoiPercent: expect.any(String), contributionIncrease: expect.any(String),
      contributionEndAge: expect.any(String), claimAge: expect.any(String),
      socialSecurityCola: expect.any(String), expenseChanges: expect.any(String),
    });
  });

  it('returns a distinct error only for each invalid money field', () => {
    expect(validateRetirementPlan(planFor({ annualRetirementExpense: -1 }))).toEqual({
      annualRetirementExpense: 'Annual withdrawal must be a non-negative amount.',
    });
    expect(validateRetirementPlan(planFor({ taxableContribution: { monthlyAmount: -1, annualIncreasePercent: 0, endAge: 60 } }))).toEqual({
      taxableContributionAmount: 'Taxable monthly contribution must be a non-negative amount.',
    });
    expect(validateRetirementPlan(planFor({ retirementContribution: { monthlyAmount: -1, annualIncreasePercent: 0, endAge: 60 } }))).toEqual({
      retirementContributionAmount: 'Retirement monthly contribution must be a non-negative amount.',
    });
    expect(validateRetirementPlan(planFor({ socialSecurity: { enabled: false, claimAge: 62, monthlyBenefit: -1, annualColaPercent: 0 } }))).toEqual({
      socialSecurityBenefit: 'Monthly Social Security benefit must be a non-negative amount.',
    });
  });

  it('rejects an out-of-horizon Social Security claim age even when the benefit is disabled', () => {
    const errors = validateRetirementPlan(planFor({
      socialSecurity: { enabled: false, claimAge: 61, monthlyBenefit: 0, annualColaPercent: 0 },
    }));
    expect(errors.claimAge).toBe('Social Security claim age must be a whole age of 62 or later within the plan.');
  });
  it('rejects duplicate expense events at the same retirement age', () => {
    const errors = validateRetirementPlan(planFor({ expenseChanges: [
      { age: 60, percentChange: -10, label: 'One' }, { age: 60, percentChange: 5, label: 'Two' },
    ] }));
    expect(errors.expenseChanges).toBe('Use only one expense change per age.');
  });
});

describe('retirement projection', () => {
  it('prorates first-year contributions, then escalates them independently until each end age', () => {
    const result = calculateRetirementProjection(planFor({
      longevityAge: 62,
      taxableContribution: { monthlyAmount: 500, annualIncreasePercent: 10, endAge: 41 },
      retirementContribution: { monthlyAmount: 750, annualIncreasePercent: 20, endAge: 41 },
    }), { taxable: 0, retirement: 0, hsa: 0, valuedAt: null, source: '', warnings: [] }, new Date(2026, 6, 27));
    expect(result.rows[0]).toMatchObject({ taxableContribution: 2500, retirementContribution: 3750 });
    expect(result.rows[1].taxableContribution).toBeCloseTo(6600);
    expect(result.rows[1].retirementContribution).toBeCloseTo(10800);
    expect(result.rows[2]).toMatchObject({ taxableContribution: 0, retirementContribution: 0 });
  });

  it('prorates first-year growth like contributions, then uses full annual growth', () => {
    const result = calculateRetirementProjection(planFor({
      currentAge: 41, retirementAge: 43, longevityAge: 62, annualRoiPercent: 10,
      taxableContribution: { monthlyAmount: 100 / 12, annualIncreasePercent: 0, endAge: 41 },
      retirementContribution: { monthlyAmount: 200 / 12, annualIncreasePercent: 0, endAge: 41 },
    }), { taxable: 1000, retirement: 2000, hsa: 0, valuedAt: null, source: '', warnings: [] }, new Date(2026, 7, 1));

    expect(result.rows[0]).toMatchObject({
      age: 41, taxableContribution: 100 * 4 / 12, retirementContribution: 200 * 4 / 12,
      taxableWithdrawal: 0, retirementWithdrawal: 0, totalWithdrawal: 0,
      endTaxable: 1000 + 1000 * 0.1 * 4 / 12 + 100 * 4 / 12,
      endRetirement: 2000 + 2000 * 0.1 * 4 / 12 + 200 * 4 / 12,
    });
    expect(result.rows[0].taxableGrowth).toBeCloseTo(1000 * 0.1 * 4 / 12);
    expect(result.rows[0].retirementGrowth).toBeCloseTo(2000 * 0.1 * 4 / 12);
    expect(result.rows[1].taxableGrowth).toBeCloseTo(result.rows[1].startTaxable * 0.1);
    expect(result.rows[1].retirementGrowth).toBeCloseTo(result.rows[1].startRetirement * 0.1);
  });
  it('excludes HSA by default and includes it only after opt-in', () => {
    const valuation = { taxable: 0, retirement: 1000, hsa: 500, valuedAt: null, source: '', warnings: [], isComplete: true };
    const excluded = calculateRetirementProjection(planFor(), valuation);
    const included = calculateRetirementProjection(planFor({ includeHsaInRetirement: true }), valuation);
    expect(excluded.openingRetirement).toBe(1000);
    expect(excluded.excludedHsa).toBe(500);
    expect(included.openingRetirement).toBe(1500);
    expect(included.excludedHsa).toBe(0);
  });

  it('shows a taxable liquidity gap before 60, then draws retirement without negative balances', () => {
    const result = calculateRetirementProjection(planFor({
      currentAge: 58, retirementAge: 58, longevityAge: 62, annualRetirementExpense: 2000,
      taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 58 },
      retirementContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 58 },
    }), { taxable: 1000, retirement: 2500, hsa: 0, valuedAt: null, source: '', warnings: [] });
    expect(result.rows[0]).toMatchObject({ age: 58, taxableWithdrawal: 1000, retirementWithdrawal: 0, unmetNeed: 1000, status: 'liquidity_gap' });
    expect(result.rows[1]).toMatchObject({ age: 59, retirementWithdrawal: 0, unmetNeed: 2000 });
    expect(result.rows[2]).toMatchObject({ age: 60, retirementWithdrawal: 2000, unmetNeed: 0 });
    expect(result.rows.every((row) => row.endTaxable >= 0 && row.endRetirement >= 0)).toBe(true);
  });

  it('compounds ordered expense changes and applies Social Security COLA after claim age', () => {
    const result = calculateRetirementProjection(planFor({
      currentAge: 62, retirementAge: 62, longevityAge: 65, annualRetirementExpense: 30000,
      taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 62 },
      retirementContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 62 },
      expenseChanges: [{ age: 63, percentChange: -20, label: 'Mortgage paid off' }, { age: 64, percentChange: 10, label: 'Travel' }],
      socialSecurity: { enabled: true, claimAge: 63, monthlyBenefit: 1000, annualColaPercent: 2 },
    }), { taxable: 100000, retirement: 0, hsa: 0, valuedAt: null, source: '', warnings: [] });
    expect(result.rows[0]).toMatchObject({ expense: 30000, socialSecurity: 0 });
    expect(result.rows[1]).toMatchObject({ expense: 24000, socialSecurity: 12000 });
    expect(result.rows[2].expense).toBeCloseTo(26400);
    expect(result.rows[2].socialSecurity).toBeCloseTo(12240);
    expect(result.rows[2].applicableExpenseChanges).toEqual(['Mortgage paid off', 'Travel']);
  });

  it('reports exact asset depletion only after the plan has held a positive balance', () => {
    const plan = planFor({
      currentAge: 60,
      retirementAge: 60,
      longevityAge: 62,
      annualRetirementExpense: 300,
      taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 60 },
      retirementContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 60 },
      socialSecurity: { enabled: false, claimAge: 62, monthlyBenefit: 0, annualColaPercent: 0 },
    });
    const depleted = calculateRetirementProjection(plan, {
      taxable: 900, retirement: 0, hsa: 0, valuedAt: null, source: '', warnings: [],
    });
    const zeroStart = calculateRetirementProjection({ ...plan, annualRetirementExpense: 0 }, {
      taxable: 0, retirement: 0, hsa: 0, valuedAt: null, source: '', warnings: [],
    });

    expect(depleted.rows[depleted.rows.length - 1]).toMatchObject({ age: 62, totalEnd: 0, unmetNeed: 0 });
    expect(depleted.firstGapAge).toBeUndefined();
    expect(depleted.firstDepletionAge).toBe(62);
    expect(zeroStart.firstDepletionAge).toBeUndefined();
  });
  it('uses the configured annual withdrawal without a rate cap and reports insufficient funds', () => {
    const funded = calculateRetirementProjection(planFor({ annualRetirementExpense: 10000 }), {
      taxable: 100000, retirement: 0, hsa: 0, valuedAt: null, source: '', warnings: [{ code: 'missing_price', message: 'Missing' }], isComplete: false,
    });
    const fundedRetirementRow = funded.rows.find((row) => row.age === 60);
    expect(fundedRetirementRow).toMatchObject({ totalWithdrawal: 10000, unmetNeed: 0, status: 'funded' });
    expect(funded).toMatchObject({ balanceAtRetirement: fundedRetirementRow?.totalEnd, firstRetirementYearNeed: 10000, valuationComplete: false });

    const shortfall = calculateRetirementProjection(planFor({ annualRetirementExpense: 10000 }), {
      taxable: 4000, retirement: 0, hsa: 0, valuedAt: null, source: '', warnings: [], isComplete: true,
    });
    expect(shortfall.rows.find((row) => row.age === 60)).toMatchObject({ totalWithdrawal: 4000, unmetNeed: 6000, status: 'funding_shortfall' });
    expect(shortfall.firstGapAge).toBe(60);
  });
});
