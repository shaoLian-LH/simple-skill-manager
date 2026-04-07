import fs from 'node:fs/promises';
import path from 'node:path';

import { SkmError } from '../errors.js';
import {
  getTargetSpec,
  resolveManagedInstallPath,
  resolveTargetInstallBasePath,
} from './targets.js';
import type {
  ActivationScope,
  ActivationState,
  InstallMode,
  InstalledSkillRecord,
  SkillDefinition,
  TargetName,
} from '../types.js';
import { copyDirectory, ensureDir, movePath, pathExists, readLinkTarget, removePath, writeTextFileAtomic } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';
 
export type ManagedInstallKind = 'skill-directory' | 'generated-file';

export interface ManagedInstallPlan {
  installPath: string;
  installKind: ManagedInstallKind;
  cleanupRootPath?: string;
  preferredMode?: InstallMode;
  generatedContent?: string;
}

export interface ManagedInstallPlanResolverInput {
  scope: ActivationScope;
  projectPath?: string;
  target: TargetName;
  skillName: string;
  record?: InstalledSkillRecord;
  previousRecord?: InstalledSkillRecord;
  skill?: SkillDefinition;
}

export type ManagedInstallPlanResolver = (input: ManagedInstallPlanResolverInput) => ManagedInstallPlan;

export interface ManagedInstallBatchOptions {
  projectPath?: string;
  skills?: Map<string, SkillDefinition>;
  resolveInstallPlan?: ManagedInstallPlanResolver;
}

interface ManagedInstallContext {
  scope: ActivationScope;
  projectPath?: string;
  target: TargetName;
  skillName: string;
  sourcePath: string;
  preferredMode: InstallMode;
  previousRecord?: InstalledSkillRecord;
  installPlan?: ManagedInstallPlan;
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

function createDefaultInstallPlan(projectPath: string, target: TargetName, skillName: string): ManagedInstallPlan {
  const targetSpec = getTargetSpec(target);
  return {
    installPath: resolveManagedInstallPath({
      scope: 'project',
      projectPath,
      target,
      skillName,
    }),
    installKind: targetSpec.installKind === 'gemini-command' ? 'generated-file' : 'skill-directory',
    cleanupRootPath: resolveTargetInstallBasePath({
      scope: 'project',
      projectPath,
      target,
    }),
  };
}

function resolveManagedInstallPlan(
  input: ManagedInstallPlanResolverInput,
  resolver?: ManagedInstallPlanResolver,
): ManagedInstallPlan {
  const fallbackPlan =
    input.scope === 'project'
      ? createDefaultInstallPlan(input.projectPath ?? '', input.target, input.skillName)
      : {
          installPath: resolveManagedInstallPath({
            scope: input.scope,
            projectPath: input.projectPath,
            target: input.target,
            skillName: input.skillName,
          }),
          installKind: getTargetSpec(input.target).installKind === 'gemini-command' ? 'generated-file' : 'skill-directory',
          cleanupRootPath: resolveTargetInstallBasePath({
            scope: input.scope,
            projectPath: input.projectPath,
            target: input.target,
          }),
        };
  if (!resolver) {
    return fallbackPlan;
  }

  const resolved = resolver(input);
  return {
    ...resolved,
    installPath: path.resolve(resolved.installPath),
    cleanupRootPath: path.resolve(resolved.cleanupRootPath ?? fallbackPlan.cleanupRootPath ?? path.dirname(resolved.installPath)),
  };
}

function getGeneratedContentOrThrow(plan: ManagedInstallPlan): string {
  if (typeof plan.generatedContent === 'string') {
    return plan.generatedContent;
  }

  throw new SkmError('runtime', 'Generated install plan is missing content.', {
    details: `Install path: ${plan.installPath}`,
  });
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

async function createGeneratedInstall(content: string, installPath: string): Promise<void> {
  await writeTextFileAtomic(installPath, content);
}

async function generatedInstallMatches(installPath: string, expectedContent: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(installPath);
    if (!stats.isFile()) {
      return false;
    }

    const current = await fs.readFile(installPath, 'utf8');
    return current === expectedContent;
  } catch {
    return false;
  }
}

function isGeneratedMode(mode: InstallMode | undefined): mode is 'generated' {
  return mode === 'generated';
}

export async function ensureManagedInstall(context: ManagedInstallContext): Promise<InstallResult> {
  const plan =
    context.installPlan ??
    resolveManagedInstallPlan(
      {
        scope: context.scope,
        projectPath: context.projectPath,
        target: context.target,
        skillName: context.skillName,
        previousRecord: context.previousRecord,
      },
      undefined,
    );
  const installPath = plan.installPath;
  await ensureDir(path.dirname(installPath));

  if (context.previousRecord && (await pathExists(installPath))) {
      if (plan.installKind === 'generated-file') {
      if (isGeneratedMode(context.previousRecord.installMode)) {
        const expectedContent = getGeneratedContentOrThrow(plan);
        if (await generatedInstallMatches(installPath, expectedContent)) {
          return {
            installMode: 'generated',
            installedAt: context.previousRecord.installedAt,
            changed: false,
          };
        }
      }
    } else if (context.previousRecord.installMode === 'symlink') {
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

  if (plan.installKind === 'generated-file') {
    const content = getGeneratedContentOrThrow(plan);
    await createGeneratedInstall(content, installPath);
    return { installMode: 'generated', installedAt: nowIso(), changed: true };
  }

  const preferredMode = plan.preferredMode ?? context.preferredMode;
  if (preferredMode === 'copy') {
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
  scope: ActivationScope,
  nextState: ActivationState,
  previousState: ActivationState,
  options: ManagedInstallBatchOptions = {},
): Promise<void> {
  for (const [target, targetState] of Object.entries(nextState.targets) as Array<[TargetName, NonNullable<ActivationState['targets'][TargetName]>]>) {
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
      const installPath = plan.installPath;
      if (!(await pathExists(installPath))) {
        continue;
      }

      if (!previousRecord) {
        throw new SkmError('conflict', `Target path is already occupied: ${installPath}.`, {
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

  for (const [target, targetState] of Object.entries(nextState.targets) as Array<[TargetName, NonNullable<ActivationState['targets'][TargetName]>]>) {
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
      const installPath = plan.installPath;

      if (!previousRecord) {
        changes.push({ target, skillName, installPath });
        continue;
      }

      const hasExistingPath = await pathExists(installPath);
      const sourceChanged = previousRecord.sourcePath !== record.sourcePath;
      const modeChanged = previousRecord.installMode !== record.installMode;
      let generatedContentChanged = false;
      if (!sourceChanged && !modeChanged && hasExistingPath && plan.installKind === 'generated-file') {
        const expectedContent = getGeneratedContentOrThrow(plan);
        generatedContentChanged = !(await generatedInstallMatches(installPath, expectedContent));
      }

      if (!hasExistingPath || sourceChanged || modeChanged || generatedContentChanged) {
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

export async function applyManagedInstalls<TState extends ActivationState>(
  scope: ActivationScope,
  nextState: TState,
  previousState: TState,
  options: ManagedInstallBatchOptions = {},
): Promise<TState> {
  const updatedState: TState = JSON.parse(JSON.stringify(nextState)) as TState;

  for (const [target, targetState] of Object.entries(updatedState.targets) as Array<[TargetName, NonNullable<ActivationState['targets'][TargetName]>]>) {
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

      targetState.skills[skillName] = {
        ...record,
        installMode: result.installMode as InstallMode,
        installedAt: result.changed ? result.installedAt : record.installedAt,
      };
    }
  }

  return updatedState;
}

export interface RemoveManagedInstallOptions extends ManagedInstallBatchOptions {
  record?: InstalledSkillRecord;
  previousRecord?: InstalledSkillRecord;
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
  const installPath = plan.installPath;
  if (await pathExists(installPath)) {
    await removePath(installPath);
  }
  await removeEmptyAncestorDirectories(installPath, plan.cleanupRootPath ?? path.dirname(installPath));
}
