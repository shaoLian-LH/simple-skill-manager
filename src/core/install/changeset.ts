import { SkmError } from '../errors.js';
import type { ActivationScope, ActivationState, SkillDefinition, TargetName } from '../types.js';
import { movePath, pathExists, removePath } from '../utils/fs.js';
import { generatedInstallMatches } from './ensure.js';
import { getGeneratedContentOrThrow, resolveManagedInstallPlan, type ManagedInstallPlanResolver } from './plan.js';

export interface ManagedInstallBatchOptions {
  projectPath?: string;
  skills?: Map<string, SkillDefinition>;
  resolveInstallPlan?: ManagedInstallPlanResolver;
}

interface PendingBackup {
  originalPath: string;
  backupPath: string;
}

export interface PendingInstallChange {
  target: TargetName;
  skillName: string;
  installPath: string;
  backup?: PendingBackup;
}

export async function preflightInstallConflicts(
  scope: ActivationScope,
  nextState: ActivationState,
  previousState: ActivationState,
  options: ManagedInstallBatchOptions = {},
): Promise<void> {
  for (const [target, targetState] of Object.entries(nextState.targets) as Array<
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
        },
        options.resolveInstallPlan,
      );

      if (!(await pathExists(plan.installPath))) {
        continue;
      }

      if (!previousRecord) {
        throw new SkmError('conflict', `Target path is already occupied: ${plan.installPath}.`, {
          hint: 'Remove or rename the existing entry, then run the command again.',
        });
      }
    }
  }
}

export async function backupChangedManagedPaths(
  scope: ActivationScope,
  nextState: ActivationState,
  previousState: ActivationState,
  options: ManagedInstallBatchOptions = {},
): Promise<PendingInstallChange[]> {
  const changes: PendingInstallChange[] = [];

  for (const [target, targetState] of Object.entries(nextState.targets) as Array<
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
        },
        options.resolveInstallPlan,
      );

      if (!previousRecord) {
        changes.push({ target, skillName, installPath: plan.installPath });
        continue;
      }

      const hasExistingPath = await pathExists(plan.installPath);
      const sourceChanged = previousRecord.sourcePath !== record.sourcePath;
      const modeChanged = previousRecord.installMode !== record.installMode;
      let generatedContentChanged = false;

      if (!sourceChanged && !modeChanged && hasExistingPath && plan.installKind === 'generated-file') {
        const expectedContent = getGeneratedContentOrThrow(plan);
        generatedContentChanged = !(await generatedInstallMatches(plan.installPath, expectedContent));
      }

      if (!hasExistingPath || sourceChanged || modeChanged || generatedContentChanged) {
        if (!hasExistingPath) {
          changes.push({ target, skillName, installPath: plan.installPath });
          continue;
        }

        const backupPath = `${plan.installPath}.skm-backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await movePath(plan.installPath, backupPath);
        changes.push({
          target,
          skillName,
          installPath: plan.installPath,
          backup: {
            originalPath: plan.installPath,
            backupPath,
          },
        });
      }
    }
  }

  return changes;
}

export async function restoreInstallChanges(changes: PendingInstallChange[]): Promise<void> {
  for (const change of [...changes].reverse()) {
    await removePath(change.installPath);
    if (change.backup) {
      await movePath(change.backup.backupPath, change.backup.originalPath);
    }
  }
}

export async function commitInstallChanges(changes: PendingInstallChange[]): Promise<void> {
  for (const change of changes) {
    if (change.backup) {
      await removePath(change.backup.backupPath);
    }
  }
}
