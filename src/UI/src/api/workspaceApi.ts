import type { RetirementPlan } from '../domain/retirementPlan';
import type { Workspace } from '../domain/workspace';
import { readBeginningNetWorth, writeBeginningNetWorth } from '../domain/netWorthConfiguration';
import type { HttpClient } from './httpClient';

type WorkspaceApiModel = Omit<Workspace, 'retirementPlan'> & {
  retirementPlan: (RetirementPlan & {
    withdrawalRatePercent?: number;
    withdrawalMode?: 'meet_expense' | 'cap_at_target_rate';
  }) | null;
};

export async function loadWorkspace(client: HttpClient): Promise<Workspace> {
  const workspace = await client.get<WorkspaceApiModel>('/workspace');
  if (!workspace.netWorth) {
    const legacyValue = readBeginningNetWorth();
    if (legacyValue !== undefined) {
      const saved = await client.put<NonNullable<Workspace['netWorth']>>('/net-worth', {
        beginningNetWorth: legacyValue,
      });
      workspace.netWorth = saved;
      writeBeginningNetWorth(undefined);
    }
  }

  if (!workspace.retirementPlan) return workspace;

  const retirementPlan = { ...workspace.retirementPlan };
  delete retirementPlan.withdrawalRatePercent;
  delete retirementPlan.withdrawalMode;
  return { ...workspace, retirementPlan };
}
