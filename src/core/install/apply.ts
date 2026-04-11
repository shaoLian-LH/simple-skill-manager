import type { ActivationScope, ActivationState, InstallMode, InstalledSkillRecord, SkillDefinition, TargetName } from '../types.js';
import { ensureManagedInstall } from './ensure.js';
import { resolveManagedInstallPlan } from './plan.js';
import type { ManagedInstallBatchOptions } from './changeset.js';

function cloneActivationState<TState extends ActivationState>(state: TState): TState {
  return structuredClone(state);
}

export async function applyManagedInstalls<TState extends ActivationState>(
  scope: ActivationScope,
  nextState: TState,
  previousState: TState,
  options: ManagedInstallBatchOptions = {},
): Promise<TState> {
  const updatedState = cloneActivationState(nextState);

  for (const [target, targetState] of Object.entries(updatedState.targets) as Array<
    [TargetName, NonNullable<ActivationState['targets'][TargetName]>]
  >) {
    for (const [skillName, record] of Object.entries(targetState.skills)) {
      const previousRecord = previousState.targets[target]?.skills[skillName];
      const plan = resolveManagedInstallPlan(
        {
          scope,
          projectPath: options.projectPath,
          target,
          skillName,
          record,
          previousRecord,
          skill: options.skills?.get(skillName),
        },
        options.resolveInstallPlan,
      );
      const result = await ensureManagedInstall({
        scope,
        projectPath: options.projectPath,
        target,
        skillName,
        sourcePath: record.sourcePath,
        preferredMode: plan.preferredMode ?? previousRecord?.installMode ?? record.installMode,
        previousRecord,
        installPlan: plan,
      });

      targetState.skills[skillName] = createInstalledSkillRecord(record, result.installMode, result.changed ? result.installedAt : record.installedAt);
    }
  }

  return updatedState;
}

function createInstalledSkillRecord(
  record: InstalledSkillRecord,
  installMode: InstallMode,
  installedAt: string,
): InstalledSkillRecord {
  return {
    ...record,
    installMode,
    installedAt,
  };
}
