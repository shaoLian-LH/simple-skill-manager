import fs from 'node:fs/promises';
import path from 'node:path';

import { SkmError } from '../errors.js';
import { resolveManagedInstallPath, resolveTargetInstallBasePath } from '../install/targets.js';
import { createProjectIndexEntry, loadProjectsIndex } from '../project/projects-index.js';
import { listPresets } from '../registry/presets.js';
import type { ActivationScope, ActivationState, DoctorIssue, TargetName } from '../types.js';
import { pathExists } from '../utils/fs.js';
import { buildScopedContext, getProjectPathForScope, type ScopedContext } from './context.js';
import { buildGeminiCommandContent } from './install-plan.js';
import { resolveKnownSkills } from './skill-resolution.js';
import { getExistingTargets, getManagedSkillNames } from './state-builder.js';

function indexEntryEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

export function getMissingStateError(scope: ActivationScope): SkmError {
  return new SkmError('config', `${scope === 'global' ? 'Global' : 'Project'} state is missing.`, {
    hint:
      scope === 'global'
        ? 'Run `skm skill on <name> --global --target <target>` or `skm preset on <name> --global --target <target>` first.'
        : 'Run `skm skill on <name>` or `skm preset on <name>` first.',
  });
}

export async function detectUnexpectedTargetEntries(
  scope: ActivationScope,
  projectPath: string | undefined,
  state: ActivationState,
): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];

  async function walkUnexpectedEntries(
    target: TargetName,
    targetBasePath: string,
    currentDir: string,
    expectedRelativePaths: Set<string>,
  ): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(targetBasePath, entryPath).split(path.sep).join('/');
      const exactMatch = expectedRelativePaths.has(relativePath);
      const hasManagedDescendant = [...expectedRelativePaths].some((skillPath) => skillPath.startsWith(`${relativePath}/`));

      if (exactMatch) {
        continue;
      }

      if (entry.isDirectory() && hasManagedDescendant) {
        await walkUnexpectedEntries(target, targetBasePath, entryPath, expectedRelativePaths);
        continue;
      }

      issues.push({
        type: 'unexpected-target-entry',
        target,
        skillName: relativePath,
        path: entryPath,
        message: `Unexpected entry exists at ${entryPath}.`,
      });
    }
  }

  for (const target of getExistingTargets(state)) {
    const targetBasePath = resolveTargetInstallBasePath({
      scope,
      projectPath,
      target,
    });
    if (!(await pathExists(targetBasePath))) {
      continue;
    }

    const expectedRelativePaths = new Set(
      Object.keys(state.targets[target]?.skills ?? {}).map((skillName) =>
        path.relative(
          targetBasePath,
          resolveManagedInstallPath({
            scope,
            projectPath,
            target,
            skillName,
          }),
        )
          .split(path.sep)
          .join('/'),
      ),
    );
    await walkUnexpectedEntries(target, targetBasePath, targetBasePath, expectedRelativePaths);
  }

  return issues;
}

async function collectPresetIssues(context: ScopedContext, scope: ActivationScope): Promise<DoctorIssue[]> {
  const presets = await listPresets();
  const issues: DoctorIssue[] = [];

  for (const presetName of context.previousState.enabledPresets) {
    if (presets[presetName]) {
      continue;
    }

    issues.push({
      type: 'missing-preset-definition',
      presetName,
      path: context.paths.presetsFile,
      message: `Preset ${presetName} is enabled in ${scope} state but missing from ${context.paths.presetsFile}.`,
    });
  }

  return issues;
}

async function collectInstallIssues(context: ScopedContext, scope: ActivationScope): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];
  const resolvedSkills = await resolveKnownSkills(context.config.skillsDir, getManagedSkillNames(context.previousState));

  for (const [target, targetState] of Object.entries(context.previousState.targets) as Array<
    [TargetName, NonNullable<ActivationState['targets'][TargetName]>]
  >) {
    for (const [skillName, record] of Object.entries(targetState.skills)) {
      if (!(await pathExists(record.sourcePath))) {
        issues.push({
          type: 'missing-source',
          target,
          skillName,
          path: record.sourcePath,
          message: `Source path is missing for ${skillName}: ${record.sourcePath}.`,
        });
      }

      const installPath = resolveManagedInstallPath({
        scope,
        projectPath: getProjectPathForScope(context),
        target,
        skillName,
      });
      if (!(await pathExists(installPath))) {
        issues.push({
          type: 'missing-installation',
          target,
          skillName,
          path: installPath,
          message: `Installation is missing for ${skillName} at ${installPath}.`,
        });
        continue;
      }

      if (record.installMode === 'symlink') {
        try {
          const stats = await fs.lstat(installPath);
          if (!stats.isSymbolicLink()) {
            issues.push({
              type: 'broken-link',
              target,
              skillName,
              path: installPath,
              expectedPath: record.sourcePath,
              message: `Expected a symlink at ${installPath}.`,
            });
            continue;
          }

          const linkTarget = await fs.readlink(installPath);
          const resolvedPath = path.resolve(path.dirname(installPath), linkTarget);
          if (resolvedPath !== record.sourcePath) {
            issues.push({
              type: 'broken-link',
              target,
              skillName,
              path: installPath,
              expectedPath: record.sourcePath,
              message: `Symlink at ${installPath} points to ${resolvedPath}, expected ${record.sourcePath}.`,
            });
          }
        } catch {
          issues.push({
            type: 'broken-link',
            target,
            skillName,
            path: installPath,
            expectedPath: record.sourcePath,
            message: `Symlink at ${installPath} could not be verified.`,
          });
        }
        continue;
      }

      if (record.installMode === 'copy') {
        issues.push({
          type: 'copied-skill-may-have-drifted',
          target,
          skillName,
          path: installPath,
          expectedPath: record.sourcePath,
          message: `Copy-mode installation for ${skillName} at ${installPath} may have drifted from ${record.sourcePath}.`,
        });
        continue;
      }

      const skill = resolvedSkills.get(skillName);
      if (!skill) {
        continue;
      }

      const expectedContent = buildGeminiCommandContent(skill);
      const currentContent = await fs.readFile(installPath, 'utf8').catch(() => '');
      if (currentContent !== expectedContent) {
        issues.push({
          type: 'broken-link',
          target,
          skillName,
          path: installPath,
          expectedPath: record.sourcePath,
          message: `Generated installation at ${installPath} is out of sync with ${record.sourcePath}.`,
        });
      }
    }
  }

  return issues;
}

export async function doctorScope(scope: ActivationScope, projectPath?: string): Promise<DoctorIssue[]> {
  const context = await buildScopedContext(scope, projectPath);
  if (!context.hadPreviousState) {
    throw getMissingStateError(scope);
  }

  const issues = await collectPresetIssues(context, scope);
  issues.push(...(await collectInstallIssues(context, scope)));
  issues.push(...(await detectUnexpectedTargetEntries(scope, getProjectPathForScope(context), context.previousState)));

  if (context.scope === 'project') {
    const projectsIndex = await loadProjectsIndex(context.paths.projectsFile);
    const expectedIndexEntry = createProjectIndexEntry(context.previousState);
    const currentIndexEntry = projectsIndex.projects[context.projectPath];
    if (!indexEntryEquals(currentIndexEntry, expectedIndexEntry)) {
      issues.push({
        type: 'stale-global-index',
        path: context.paths.projectsFile,
        message: `Global projects index is stale for ${context.projectPath}.`,
      });
    }
  }

  return issues;
}

export async function doctorProject(projectPath: string): Promise<DoctorIssue[]> {
  return doctorScope('project', projectPath);
}

export async function doctorGlobal(): Promise<DoctorIssue[]> {
  return doctorScope('global');
}
