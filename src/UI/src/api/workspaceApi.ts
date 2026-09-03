import type { RetirementPlan } from '../domain/retirementPlan';
import type { Workspace } from '../domain/workspace';
import { readBeginningNetWorth, writeBeginningNetWorth } from '../domain/netWorthConfiguration';
import type { HttpClient } from './httpClient';

type RetirementPlanApiModel = RetirementPlan & {
  withdrawalRatePercent?: number;
  withdrawalMode?: 'meet_expense' | 'cap_at_target_rate';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

const optionalArray = <T,>(payload: Record<string, unknown>, key: string): T[] | undefined => {
  if (!hasOwn(payload, key)) return undefined;
  const value = payload[key];
  if (!Array.isArray(value)) throw new Error(`Invalid workspace payload: ${key} must be an array.`);
  return value as T[];
};

const optionalNullableObject = <T,>(payload: Record<string, unknown>, key: string): T | null | undefined => {
  if (!hasOwn(payload, key)) return undefined;
  const value = payload[key];
  if (value === null) return null;
  if (!isRecord(value)) throw new Error(`Invalid workspace payload: ${key} must be an object or null.`);
  return value as T;
};

const normalizeWorkspace = (payload: unknown): Workspace => {
  if (!isRecord(payload)) throw new Error('Invalid workspace payload: expected an object.');
  if (payload.schemaVersion !== 1) {
    throw new Error('Invalid workspace payload: unsupported schemaVersion.');
  }

  const retirementPlan = optionalNullableObject<RetirementPlanApiModel>(payload, 'retirementPlan');
  let normalizedRetirementPlan: RetirementPlan | null | undefined = retirementPlan;
  if (retirementPlan) {
    const normalized = { ...retirementPlan };
    delete normalized.withdrawalRatePercent;
    delete normalized.withdrawalMode;
    normalizedRetirementPlan = normalized;
  }

  return {
    schemaVersion: 1,
    incomeSources: optionalArray(payload, 'incomeSources'),
    budgetCategories: optionalArray(payload, 'budgetCategories'),
    accounts: optionalArray(payload, 'accounts'),
    holdings: optionalArray(payload, 'holdings'),
    netWorth: optionalNullableObject(payload, 'netWorth'),
    retirementPlan: normalizedRetirementPlan,
  };
};

export async function loadWorkspace(client: HttpClient): Promise<Workspace> {
  const workspace = normalizeWorkspace(await client.get<unknown>('/workspace'));
  if (workspace.netWorth === null) {
    const legacyValue = readBeginningNetWorth();
    if (legacyValue !== undefined) {
      const saved = await client.put<NonNullable<Workspace['netWorth']>>('/net-worth', {
        beginningNetWorth: legacyValue,
      });
      workspace.netWorth = saved;
      writeBeginningNetWorth(undefined);
    }
  }

  return workspace;
}
