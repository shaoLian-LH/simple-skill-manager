import fs from 'node:fs/promises';
import path from 'node:path';

import type { ActivationScope, InstalledSkillRecord, TargetName } from '../types.js';
import { pathExists, removePath } from '../utils/fs.js';
import { resolveManagedInstallPlan } from './plan.js';
import type { ManagedInstallBatchOptions } from './changeset.js';

export interface RemoveManagedInstallOptions extends ManagedInstallBatchOptions {
  record?: InstalledSkillRecord;
  previousRecord?: InstalledSkillRecord;
}

async function removeEmptyAncestorDirectories(startPath: string, stopPath: string): Promise<void> {
  let currentPath = path.dirname(startPath);
  const normalizedStopPath = path.resolve(stopPath);

  while (currentPath.startsWith(normalizedStopPath) && currentPath !== normalizedStopPath) {
    let entries: string[];
    try {
      entries = await fs.readdir(currentPath);
    } catch {
      break;
    }

    if (entries.length > 0) {
      break;
    }

    await fs.rmdir(currentPath).catch(() => undefined);
    currentPath = path.dirname(currentPath);
  }
}

export async function removeManagedInstall(
  scope: ActivationScope,
  target: TargetName,
  skillName: string,
  options: RemoveManagedInstallOptions = {},
): Promise<void> {
  const plan = resolveManagedInstallPlan(
    {
      scope,
      projectPath: options.projectPath,
      target,
      skillName,
      record: options.record,
      previousRecord: options.previousRecord,
      skill: options.skills?.get(skillName),
    },
    options.resolveInstallPlan,
  );

  if (await pathExists(plan.installPath)) {
    await removePath(plan.installPath);
  }

  await removeEmptyAncestorDirectories(plan.installPath, plan.cleanupRootPath ?? path.dirname(plan.installPath));
}
