import path from 'node:path';

import { STATE_VERSION } from '../constants.js';
import { loadConfig } from '../config/service.js';
import { SkmError } from '../errors.js';
import {
  applyManagedInstalls,
  backupChangedManagedPaths,
  commitInstallChanges,
  preflightInstallConflicts,
  removeManagedInstall,
  restoreInstallChanges,
} from '../install/installer.js';
import { assertSupportedTargets } from '../install/targets.js';
import { ensureProjectGitignore } from '../project/gitignore.js';
import { createProjectIndexEntry, loadProjectsIndex, mirrorProjectState, saveProjectsIndex } from '../project/projects-index.js';
import { getPresetByName, listPresets } from '../registry/presets.js';
import { getSkillByName } from '../registry/skills.js';
import { createEmptyProjectState, ensureProjectStateDir, getProjectStatePath, loadProjectState, saveProjectState } from '../state/project-state.js';
import type { Config, DoctorIssue, ProjectIndexEntry, ProjectState, SkillDefinition, TargetName } from '../types.js';
import { uniqueSorted } from '../utils/collection.js';
import { pathExists, removePath } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';

interface ProjectContext {
  projectPath: string;
  config: Config;
  previousState: ProjectState;
  hadPreviousState: boolean;
  projectsFilePath: string;
}

function getExistingTargets(state: ProjectState): TargetName[] {
  return Object.keys(state.targets) as TargetName[];
}

function resolveActiveTargets(requestedTargets: string[], config: Config, state: ProjectState): TargetName[] {
  assertSupportedTargets(requestedTargets);

  if (requestedTargets.length > 0) {
    return uniqueSorted([...getExistingTargets(state), ...requestedTargets]) as TargetName[];
  }

  const existingTargets = getExistingTargets(state);
  if (existingTargets.length > 0) {
    return uniqueSorted(existingTargets) as TargetName[];
  }

  return uniqueSorted(config.defaultTargets) as TargetName[];
}

async function buildProjectContext(projectPath: string): Promise<ProjectContext> {
  const { config, paths } = await loadConfig();
  const existingState = await loadProjectState(projectPath);

  return {
    projectPath,
    config,
    previousState: existingState ?? createEmptyProjectState(projectPath),
    hadPreviousState: existingState !== null,
    projectsFilePath: paths.projectsFile,
  };
}

async function resolveSkills(skillsDir: string, names: string[]): Promise<Map<string, SkillDefinition>> {
  const resolved = new Map<string, SkillDefinition>();
  for (const name of uniqueSorted(names)) {
    resolved.set(name, await getSkillByName(skillsDir, name));
  }
  return resolved;
}

async function expandPresetSkills(presetNames: string[]): Promise<string[]> {
  const presets = await listPresets();
  const skillNames: string[] = [];

  for (const presetName of presetNames) {
    const preset = presets[presetName];
    if (!preset) {
      throw new SkmError('config', `Preset ${presetName} was not found.`, {
        hint: 'Check `skm preset list` to see the available presets.',
      });
    }

    skillNames.push(...preset);
  }

  return uniqueSorted(skillNames);
}

function buildState(
  projectPath: string,
  previousState: ProjectState,
  activeTargets: TargetName[],
  enabledSkills: string[],
  enabledPresets: string[],
  resolvedSkills: Map<string, SkillDefinition>,
  updatedAt = nowIso(),
): ProjectState {
  const skillNames = uniqueSorted(resolvedSkills.keys());
  const nextTargets: ProjectState['targets'] = {};

  if (skillNames.length > 0) {
    for (const target of activeTargets) {
      const nextSkills: NonNullable<ProjectState['targets'][TargetName]>['skills'] = {};
      for (const skillName of skillNames) {
        const skill = resolvedSkills.get(skillName);
        if (!skill) {
          continue;
        }

        const previousRecord = previousState.targets[target]?.skills[skillName];
        nextSkills[skillName] = previousRecord
          ? {
              ...previousRecord,
              sourcePath: skill.dirPath,
            }
          : {
              sourcePath: skill.dirPath,
              installMode: 'symlink',
              installedAt: updatedAt,
            };
      }

      nextTargets[target] = { skills: nextSkills };
    }
  }

  return {
    version: STATE_VERSION,
    projectPath,
    targets: nextTargets,
    enabledSkills: uniqueSorted(enabledSkills),
    enabledPresets: uniqueSorted(enabledPresets),
    updatedAt,
  };
}

async function restorePreviousState(context: ProjectContext, previousIndexEntry: ProjectIndexEntry | undefined): Promise<void> {
  if (context.hadPreviousState) {
    await saveProjectState(context.projectPath, context.previousState);
  } else {
    await removePath(getProjectStatePath(context.projectPath));
    const stateDir = path.join(context.projectPath, '.skm');
    if (!(await pathExists(getProjectStatePath(context.projectPath)))) {
      await removePath(stateDir);
    }
  }

  const currentIndex = await loadProjectsIndex(context.projectsFilePath);
  if (previousIndexEntry) {
    currentIndex.projects[context.projectPath] = previousIndexEntry;
  } else {
    delete currentIndex.projects[context.projectPath];
  }
  await saveProjectsIndex(context.projectsFilePath, currentIndex);
}

async function removeObsoleteInstalls(projectPath: string, previousState: ProjectState, nextState: ProjectState): Promise<void> {
  for (const [target, targetState] of Object.entries(previousState.targets) as Array<[TargetName, NonNullable<ProjectState['targets'][TargetName]>]>) {
    for (const skillName of Object.keys(targetState.skills)) {
      if (nextState.targets[target]?.skills[skillName]) {
        continue;
      }

      await removeManagedInstall(projectPath, target, skillName);
    }
  }
}

async function reconcileState(
  context: ProjectContext,
  nextState: ProjectState,
  options: { ensureGitignore?: boolean; preserveExistingTargets?: boolean } = {},
): Promise<ProjectState> {
  const previousIndex = await loadProjectsIndex(context.projectsFilePath);
  const previousIndexEntry = previousIndex.projects[context.projectPath];

  if (options.ensureGitignore) {
    await ensureProjectGitignore(context.projectPath);
  }

  await ensureProjectStateDir(context.projectPath);
  await preflightInstallConflicts(context.projectPath, nextState, context.previousState);
  await saveProjectState(context.projectPath, nextState);

  const installChanges = await backupChangedManagedPaths(context.projectPath, nextState, context.previousState);

  try {
    await removeObsoleteInstalls(context.projectPath, context.previousState, nextState);
    const installedState = await applyManagedInstalls(context.projectPath, nextState, context.previousState);
    installedState.updatedAt = nowIso();
    await saveProjectState(context.projectPath, installedState);

    const nextIndex = mirrorProjectState(previousIndex, installedState);
    await saveProjectsIndex(context.projectsFilePath, nextIndex);
    await commitInstallChanges(installChanges);
    return installedState;
  } catch (error) {
    await restoreInstallChanges(installChanges);
    try {
      await applyManagedInstalls(context.projectPath, context.previousState, createEmptyProjectState(context.projectPath));
    } catch {
      // best-effort rollback; state/index restoration still follows
    }
    await restorePreviousState(context, previousIndexEntry);

    throw new SkmError('runtime', 'Failed to reconcile project state.', {
      details: error instanceof Error ? error.message : undefined,
      hint: 'Fix the reported issue and run `skm sync` to restore the project state.',
      cause: error,
    });
  }
}

export async function enableSkill(projectPath: string, skillName: string, requestedTargets: string[]): Promise<ProjectState> {
  const context = await buildProjectContext(projectPath);
  const activeTargets = resolveActiveTargets(requestedTargets, context.config, context.previousState);
  const enabledSkills = uniqueSorted([...context.previousState.enabledSkills, skillName]);
  const presetSkills = await expandPresetSkills(context.previousState.enabledPresets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...enabledSkills, ...presetSkills]);
  const nextState = buildState(
    projectPath,
    context.previousState,
    activeTargets,
    enabledSkills,
    context.previousState.enabledPresets,
    resolvedSkills,
  );

  return reconcileState(context, nextState, { ensureGitignore: true });
}

export async function enablePreset(projectPath: string, presetName: string, requestedTargets: string[]): Promise<ProjectState> {
  await getPresetByName(presetName);
  const context = await buildProjectContext(projectPath);
  const activeTargets = resolveActiveTargets(requestedTargets, context.config, context.previousState);
  const enabledPresets = uniqueSorted([...context.previousState.enabledPresets, presetName]);
  const presetSkills = await expandPresetSkills(enabledPresets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...context.previousState.enabledSkills, ...presetSkills]);
  const nextState = buildState(
    projectPath,
    context.previousState,
    activeTargets,
    context.previousState.enabledSkills,
    enabledPresets,
    resolvedSkills,
  );

  return reconcileState(context, nextState, { ensureGitignore: true });
}

export async function disableSkill(projectPath: string, skillName: string): Promise<ProjectState> {
  const context = await buildProjectContext(projectPath);
  const enabledSkills = context.previousState.enabledSkills.filter((entry) => entry !== skillName);
  const presetSkills = await expandPresetSkills(context.previousState.enabledPresets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...enabledSkills, ...presetSkills]);
  const activeTargets = resolvedSkills.size > 0 ? getExistingTargets(context.previousState) : [];
  const nextState = buildState(
    projectPath,
    context.previousState,
    activeTargets,
    enabledSkills,
    context.previousState.enabledPresets,
    resolvedSkills,
  );

  return reconcileState(context, nextState);
}

export async function disablePreset(projectPath: string, presetName: string): Promise<ProjectState> {
  const context = await buildProjectContext(projectPath);
  const enabledPresets = context.previousState.enabledPresets.filter((entry) => entry !== presetName);
  const presetSkills = await expandPresetSkills(enabledPresets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...context.previousState.enabledSkills, ...presetSkills]);
  const activeTargets = resolvedSkills.size > 0 ? getExistingTargets(context.previousState) : [];
  const nextState = buildState(
    projectPath,
    context.previousState,
    activeTargets,
    context.previousState.enabledSkills,
    enabledPresets,
    resolvedSkills,
  );

  return reconcileState(context, nextState);
}

function indexEntryEquals(left: ProjectIndexEntry | undefined, right: ProjectIndexEntry): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

async function detectUnexpectedTargetEntries(projectPath: string, state: ProjectState): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];

  for (const target of getExistingTargets(state)) {
    const skillsDir = path.join(projectPath, target, 'skills');
    if (!(await pathExists(skillsDir))) {
      continue;
    }

    const entries = await (await import('node:fs/promises')).default.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!state.targets[target]?.skills[entry.name]) {
        issues.push({
          type: 'unexpected-target-entry',
          target,
          skillName: entry.name,
          path: path.join(skillsDir, entry.name),
          message: `Unexpected entry exists at ${path.join(skillsDir, entry.name)}.`,
        });
      }
    }
  }

  return issues;
}

export async function doctorProject(projectPath: string): Promise<DoctorIssue[]> {
  const context = await buildProjectContext(projectPath);
  if (!context.hadPreviousState) {
    throw new SkmError('config', 'Project state is missing.', {
      hint: 'Run `skm enable skill <name>` or `skm enable preset <name>` first.',
    });
  }

  const issues: DoctorIssue[] = [];
  const fsModule = await import('node:fs/promises');
  const projectsIndex = await loadProjectsIndex(context.projectsFilePath);

  for (const [target, targetState] of Object.entries(context.previousState.targets) as Array<[TargetName, NonNullable<ProjectState['targets'][TargetName]>]>) {
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

      const installPath = path.join(projectPath, target, 'skills', skillName);
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
          const stats = await fsModule.default.lstat(installPath);
          if (!stats.isSymbolicLink()) {
            issues.push({
              type: 'broken-link',
              target,
              skillName,
              path: installPath,
              expectedPath: record.sourcePath,
              message: `Expected a symlink at ${installPath}.`,
            });
          } else {
            const linkTarget = await fsModule.default.readlink(installPath);
            const resolved = path.resolve(path.dirname(installPath), linkTarget);
            if (resolved !== record.sourcePath) {
              issues.push({
                type: 'broken-link',
                target,
                skillName,
                path: installPath,
                expectedPath: record.sourcePath,
                message: `Symlink at ${installPath} points to ${resolved}, expected ${record.sourcePath}.`,
              });
            }
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
      } else {
        issues.push({
          type: 'copied-skill-may-have-drifted',
          target,
          skillName,
          path: installPath,
          expectedPath: record.sourcePath,
          message: `Copy-mode installation for ${skillName} at ${installPath} may have drifted from ${record.sourcePath}.`,
        });
      }
    }
  }

  issues.push(...(await detectUnexpectedTargetEntries(projectPath, context.previousState)));

  const expectedIndexEntry = createProjectIndexEntry(context.previousState);
  const currentIndexEntry = projectsIndex.projects[projectPath];
  if (!indexEntryEquals(currentIndexEntry, expectedIndexEntry)) {
    issues.push({
      type: 'stale-global-index',
      path: context.projectsFilePath,
      message: `Global projects index is stale for ${projectPath}.`,
    });
  }

  return issues;
}

export async function syncProject(projectPath: string): Promise<ProjectState> {
  const context = await buildProjectContext(projectPath);
  if (!context.hadPreviousState) {
    throw new SkmError('config', 'Project state is missing.', {
      hint: 'Re-enable the desired skills or presets to recreate `.skm/state.json`.',
    });
  }

  const unexpectedEntries = await detectUnexpectedTargetEntries(projectPath, context.previousState);
  if (unexpectedEntries.length > 0) {
    throw new SkmError('conflict', 'Sync refused to overwrite unexpected target entries.', {
      details: unexpectedEntries.map((issue) => issue.path).filter(Boolean).join(', '),
      hint: 'Remove the unexpected entries or update `.skm/state.json` before running `skm sync` again.',
    });
  }

  const nextState: ProjectState = {
    ...context.previousState,
    updatedAt: nowIso(),
  };

  return reconcileState(context, nextState);
}
