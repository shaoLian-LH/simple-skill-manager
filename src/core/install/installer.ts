import fs from 'node:fs/promises';
import path from 'node:path';

import { SkmError } from '../errors.js';
import type { InstallMode, InstalledSkillRecord, ProjectState, TargetName } from '../types.js';
import { copyDirectory, ensureDir, movePath, pathExists, readLinkTarget, removePath } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';
import { resolveSkillInstallPath } from './targets.js';

interface ManagedInstallContext {
  projectPath: string;
  target: TargetName;
  skillName: string;
  sourcePath: string;
  preferredMode: InstallMode;
  previousRecord?: InstalledSkillRecord;
}

export interface InstallResult {
  installMode: InstallMode;
  installedAt: string;
  changed: boolean;
}

interface PendingBackup {
  originalPath: string;
  backupPath: string;
}

interface PendingInstallChange {
  target: TargetName;
  skillName: string;
  installPath: string;
  backup?: PendingBackup;
}

function getSymlinkType(): 'junction' | 'dir' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}

function normalizeLinkTarget(linkTarget: string, installPath: string): string {
  return path.resolve(path.dirname(installPath), linkTarget);
}

async function pathPointsToSource(installPath: string, sourcePath: string): Promise<boolean> {
  const linkTarget = await readLinkTarget(installPath);
  if (!linkTarget) {
    return false;
  }

  return normalizeLinkTarget(linkTarget, installPath) === sourcePath;
}

async function pathIsSymlink(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(targetPath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

async function createSymlinkInstall(sourcePath: string, installPath: string): Promise<void> {
  await fs.symlink(sourcePath, installPath, getSymlinkType());
}

async function createCopyInstall(sourcePath: string, installPath: string): Promise<void> {
  await copyDirectory(sourcePath, installPath);
}

export async function ensureManagedInstall(context: ManagedInstallContext): Promise<InstallResult> {
  const installPath = resolveSkillInstallPath(context.projectPath, context.target, context.skillName);
  await ensureDir(path.dirname(installPath));

  if (context.previousRecord && (await pathExists(installPath))) {
    if (context.previousRecord.installMode === 'symlink') {
      if (await pathPointsToSource(installPath, context.sourcePath)) {
        return {
          installMode: 'symlink',
          installedAt: context.previousRecord.installedAt,
          changed: false,
        };
      }
    } else if (!(await pathIsSymlink(installPath))) {
      return {
        installMode: 'copy',
        installedAt: context.previousRecord.installedAt,
        changed: false,
      };
    }
  }

  if (await pathExists(installPath)) {
    await removePath(installPath);
  }

  if (context.preferredMode === 'copy') {
    await createCopyInstall(context.sourcePath, installPath);
    return { installMode: 'copy', installedAt: nowIso(), changed: true };
  }

  try {
    await createSymlinkInstall(context.sourcePath, installPath);
    return { installMode: 'symlink', installedAt: nowIso(), changed: true };
  } catch {
    await createCopyInstall(context.sourcePath, installPath);
    return { installMode: 'copy', installedAt: nowIso(), changed: true };
  }
}

export async function preflightInstallConflicts(
  projectPath: string,
  nextState: ProjectState,
  previousState: ProjectState,
): Promise<void> {
  for (const [target, targetState] of Object.entries(nextState.targets) as Array<[TargetName, NonNullable<ProjectState['targets'][TargetName]>]>) {
    for (const [skillName] of Object.entries(targetState.skills)) {
      const installPath = resolveSkillInstallPath(projectPath, target, skillName);
      if (!(await pathExists(installPath))) {
        continue;
      }

      const previousRecord = previousState.targets[target]?.skills[skillName];
      if (!previousRecord) {
        throw new SkmError('conflict', `Target path is already occupied: ${installPath}.`, {
          hint: 'Remove or rename the existing entry, then run the command again.',
        });
      }
    }
  }
}

export async function backupChangedManagedPaths(
  projectPath: string,
  nextState: ProjectState,
  previousState: ProjectState,
): Promise<PendingInstallChange[]> {
  const changes: PendingInstallChange[] = [];

  for (const [target, targetState] of Object.entries(nextState.targets) as Array<[TargetName, NonNullable<ProjectState['targets'][TargetName]>]>) {
    for (const [skillName, record] of Object.entries(targetState.skills)) {
      const previousRecord = previousState.targets[target]?.skills[skillName];
      const installPath = resolveSkillInstallPath(projectPath, target, skillName);

      if (!previousRecord) {
        changes.push({ target, skillName, installPath });
        continue;
      }

      const hasExistingPath = await pathExists(installPath);
      const sourceChanged = previousRecord.sourcePath !== record.sourcePath;
      const modeChanged = previousRecord.installMode !== record.installMode;
      if (!hasExistingPath || sourceChanged || modeChanged) {
        if (hasExistingPath) {
          const backupPath = `${installPath}.skm-backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await movePath(installPath, backupPath);
          changes.push({
            target,
            skillName,
            installPath,
            backup: {
              originalPath: installPath,
              backupPath,
            },
          });
        } else {
          changes.push({ target, skillName, installPath });
        }
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

export async function applyManagedInstalls(
  projectPath: string,
  nextState: ProjectState,
  previousState: ProjectState,
): Promise<ProjectState> {
  const updatedState: ProjectState = JSON.parse(JSON.stringify(nextState)) as ProjectState;

  for (const [target, targetState] of Object.entries(updatedState.targets) as Array<[TargetName, NonNullable<ProjectState['targets'][TargetName]>]>) {
    for (const [skillName, record] of Object.entries(targetState.skills)) {
      const previousRecord = previousState.targets[target]?.skills[skillName];
      const result = await ensureManagedInstall({
        projectPath,
        target,
        skillName,
        sourcePath: record.sourcePath,
        preferredMode: previousRecord?.installMode ?? record.installMode,
        previousRecord,
      });

      targetState.skills[skillName] = {
        ...record,
        installMode: result.installMode,
        installedAt: result.changed ? result.installedAt : record.installedAt,
      };
    }
  }

  return updatedState;
}

export async function removeManagedInstall(projectPath: string, target: TargetName, skillName: string): Promise<void> {
  const installPath = resolveSkillInstallPath(projectPath, target, skillName);
  if (await pathExists(installPath)) {
    await removePath(installPath);
  }
}
