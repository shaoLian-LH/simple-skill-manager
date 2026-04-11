import fs from 'node:fs/promises';
import path from 'node:path';

import type { ActivationScope, InstallMode, InstalledSkillRecord, TargetName } from '../types.js';
import { copyDirectory, ensureDir, pathExists, readLinkTarget, removePath, writeTextFileAtomic } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';
import { getGeneratedContentOrThrow, resolveManagedInstallPlan, type ManagedInstallPlan } from './plan.js';

export interface ManagedInstallContext {
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

export async function generatedInstallMatches(installPath: string, expectedContent: string): Promise<boolean> {
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
