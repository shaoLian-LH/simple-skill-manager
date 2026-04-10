import fs from 'node:fs/promises';
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
  type ManagedInstallBatchOptions,
  type ManagedInstallPlan,
  type ManagedInstallPlanResolver,
} from '../install/installer.js';
import {
  assertSupportedTargets,
  getTargetSpec,
  resolveManagedInstallPath,
  resolveTargetInstallBasePath,
} from '../install/targets.js';
import { createProjectIndexEntry, loadProjectsIndex, mirrorProjectState, saveProjectsIndex } from '../project/projects-index.js';
import { ensureProjectGitignore } from '../project/gitignore.js';
import { listPresets } from '../registry/presets.js';
import { getSkillByName } from '../registry/skills.js';
import { createEmptyGlobalState, getGlobalStatePath, loadGlobalState, saveGlobalState } from '../state/global-state.js';
import {
  createEmptyProjectState,
  ensureProjectStateDir,
  getProjectStateDir,
  getProjectStatePath,
  loadProjectState,
  saveProjectState,
} from '../state/project-state.js';
import type {
  ActivationScope,
  ActivationState,
  Config,
  DoctorIssue,
  GlobalState,
  InstallMode,
  ProjectIndexEntry,
  ProjectState,
  ScopedState,
  SkillDefinition,
  TargetName,
} from '../types.js';
import { uniqueSorted } from '../utils/collection.js';
import { pathExists, removePath } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';

type LoadedPaths = Awaited<ReturnType<typeof loadConfig>>['paths'];

export interface EnableSkillsRequest {
  scope?: ActivationScope;
  projectPath?: string;
  skillNames: string[];
  targets?: string[];
}

export interface DisableSkillsRequest {
  scope?: ActivationScope;
  projectPath?: string;
  skillNames: string[];
}

export interface EnablePresetsRequest {
  scope?: ActivationScope;
  projectPath?: string;
  presetNames: string[];
  targets?: string[];
}

export interface DisablePresetsRequest {
  scope?: ActivationScope;
  projectPath?: string;
  presetNames: string[];
}

interface ProjectContext {
  scope: 'project';
  projectPath: string;
  config: Config;
  previousState: ProjectState;
  hadPreviousState: boolean;
  paths: LoadedPaths;
}

interface GlobalContext {
  scope: 'global';
  config: Config;
  previousState: GlobalState;
  hadPreviousState: boolean;
  paths: LoadedPaths;
}

type ScopedContext = ProjectContext | GlobalContext;

function normalizeScope(scope?: ActivationScope): ActivationScope {
  return scope ?? 'project';
}

function requireProjectPath(projectPath: string | undefined): string {
  if (!projectPath || projectPath.trim().length === 0) {
    throw new SkmError('usage', 'Project path is required for project-scoped operations.', {
      hint: 'Run the command inside a project directory or provide a project path.',
    });
  }

  return projectPath;
}

function getProjectPathForScope(context: ScopedContext): string | undefined {
  return context.scope === 'project' ? context.projectPath : undefined;
}

function createEmptyState(scope: 'project', projectPath: string): ProjectState;
function createEmptyState(scope: 'global'): GlobalState;
function createEmptyState(scope: ActivationScope, projectPath?: string): ScopedState;
function createEmptyState(scope: ActivationScope, projectPath?: string): ScopedState {
  if (scope === 'project') {
    return createEmptyProjectState(requireProjectPath(projectPath));
  }

  return createEmptyGlobalState();
}

function getExistingTargets(state: ActivationState): TargetName[] {
  return Object.keys(state.targets) as TargetName[];
}

function getManagedSkillNames(state: ActivationState): string[] {
  const names = new Set<string>(state.enabledSkills);
  for (const targetState of Object.values(state.targets)) {
    if (!targetState) {
      continue;
    }

    for (const skillName of Object.keys(targetState.skills)) {
      names.add(skillName);
    }
  }

  return uniqueSorted(names);
}

function resolveActiveTargets(
  requestedTargets: string[] | undefined,
  scope: ActivationScope,
  config: Config,
  state: ActivationState,
): TargetName[] {
  const existingTargets = getExistingTargets(state);

  if (requestedTargets === undefined) {
    if (existingTargets.length > 0) {
      return uniqueSorted(existingTargets) as TargetName[];
    }

    return uniqueSorted(config.defaultTargets) as TargetName[];
  }

  assertSupportedTargets(requestedTargets);

  if (requestedTargets.length > 0) {
    return uniqueSorted([...existingTargets, ...requestedTargets]) as TargetName[];
  }

  if (existingTargets.length > 0) {
    return uniqueSorted(existingTargets) as TargetName[];
  }

  if (scope === 'project') {
    return uniqueSorted(config.defaultTargets) as TargetName[];
  }

  return [];
}

async function buildScopedContext(scope: 'project', projectPath: string): Promise<ProjectContext>;
async function buildScopedContext(scope: 'global'): Promise<GlobalContext>;
async function buildScopedContext(scope: ActivationScope, projectPath?: string): Promise<ScopedContext>;
async function buildScopedContext(scope: ActivationScope, projectPath?: string): Promise<ScopedContext> {
  const { config, paths } = await loadConfig();

  if (scope === 'project') {
    const resolvedProjectPath = requireProjectPath(projectPath);
    const existingState = await loadProjectState(resolvedProjectPath);

    return {
      scope,
      projectPath: resolvedProjectPath,
      config,
      previousState: existingState ?? createEmptyProjectState(resolvedProjectPath),
      hadPreviousState: existingState !== null,
      paths,
    };
  }

  const existingState = await loadGlobalState(paths);
  return {
    scope,
    config,
    previousState: existingState ?? createEmptyGlobalState(),
    hadPreviousState: existingState !== null,
    paths,
  };
}

function collectMissingPresetNames(presetNames: string[], presets: Record<string, string[]>): string[] {
  return uniqueSorted(presetNames.filter((name) => !presets[name]));
}

function assertNoMissingPresetDefinitions(presetNames: string[], presets: Record<string, string[]>, operation: string): void {
  const missing = collectMissingPresetNames(presetNames, presets);
  if (missing.length === 0) {
    return;
  }

  throw new SkmError('config', `Preset definitions are missing for ${missing.join(', ')}.`, {
    details: `Failed while ${operation}.`,
    hint: `Recreate the missing presets or run \`skm preset off ${missing.join(' ')}\` in this scope.`,
  });
}

async function resolveSkills(skillsDir: string, names: string[]): Promise<Map<string, SkillDefinition>> {
  const resolved = new Map<string, SkillDefinition>();
  for (const name of uniqueSorted(names)) {
    resolved.set(name, await getSkillByName(skillsDir, name));
  }
  return resolved;
}

async function resolveKnownSkills(skillsDir: string, names: string[]): Promise<Map<string, SkillDefinition>> {
  const resolved = new Map<string, SkillDefinition>();

  for (const name of uniqueSorted(names)) {
    try {
      resolved.set(name, await getSkillByName(skillsDir, name));
    } catch {
      continue;
    }
  }

  return resolved;
}

function expandPresetSkillsFromMap(presetNames: string[], presets: Record<string, string[]>): string[] {
  const skillNames: string[] = [];
  for (const presetName of presetNames) {
    const preset = presets[presetName];
    if (preset) {
      skillNames.push(...preset);
    }
  }
  return uniqueSorted(skillNames);
}

function assertEnableTargets(scope: ActivationScope, activeTargets: TargetName[]): void {
  if (activeTargets.length > 0) {
    return;
  }

  if (scope === 'global') {
    throw new SkmError('usage', 'At least one target is required for global enable operations.', {
      hint: 'Pass `--target <target>` or configure `defaultTargets` in `config.json`.',
    });
  }

  throw new SkmError('usage', 'At least one target is required to enable skills or presets.', {
    hint: 'Pass `--target <target>` or configure `defaultTargets` in `config.json`.',
  });
}

function buildState(
  context: ScopedContext,
  previousState: ScopedState,
  activeTargets: TargetName[],
  enabledSkills: string[],
  enabledPresets: string[],
  resolvedSkills: Map<string, SkillDefinition>,
  updatedAt = nowIso(),
): ScopedState {
  const skillNames = uniqueSorted(resolvedSkills.keys());
  const nextTargets: ActivationState['targets'] = {};

  if (skillNames.length > 0) {
    for (const target of activeTargets) {
      const nextSkills: NonNullable<ActivationState['targets'][TargetName]>['skills'] = {};
      const defaultInstallMode: InstallMode = getTargetSpec(target).installKind === 'gemini-command' ? 'generated' : 'symlink';

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
              installMode: defaultInstallMode,
              installedAt: updatedAt,
            };
      }

      nextTargets[target] = { skills: nextSkills };
    }
  }

  const baseState: ActivationState = {
    version: STATE_VERSION,
    targets: nextTargets,
    enabledSkills: uniqueSorted(enabledSkills),
    enabledPresets: uniqueSorted(enabledPresets),
    updatedAt,
  };

  if (context.scope === 'project') {
    return {
      ...baseState,
      projectPath: context.projectPath,
    };
  }

  return baseState;
}

async function saveScopedState(context: ProjectContext, state: ProjectState): Promise<void>;
async function saveScopedState(context: GlobalContext, state: GlobalState): Promise<void>;
async function saveScopedState(context: ScopedContext, state: ScopedState): Promise<void>;
async function saveScopedState(context: ScopedContext, state: ScopedState): Promise<void> {
  if (context.scope === 'project') {
    await saveProjectState(context.projectPath, state as ProjectState);
    return;
  }

  await saveGlobalState(state as GlobalState, context.paths);
}

async function removeScopedState(context: ScopedContext): Promise<void> {
  if (context.scope === 'project') {
    await removePath(getProjectStatePath(context.projectPath));
    await removePath(getProjectStateDir(context.projectPath));
    return;
  }

  await removePath(getGlobalStatePath(context.paths));
}

async function restorePreviousState(context: ScopedContext, previousIndexEntry: ProjectIndexEntry | undefined): Promise<void> {
  if (context.hadPreviousState) {
    await saveScopedState(context, context.previousState);
  } else {
    await removeScopedState(context);
  }

  if (context.scope !== 'project') {
    return;
  }

  const currentIndex = await loadProjectsIndex(context.paths.projectsFile);
  if (previousIndexEntry) {
    currentIndex.projects[context.projectPath] = previousIndexEntry;
  } else {
    delete currentIndex.projects[context.projectPath];
  }
  await saveProjectsIndex(context.paths.projectsFile, currentIndex);
}

function buildGeminiCommandContent(skill: SkillDefinition): string {
  return `description = ${JSON.stringify(skill.description)}\nprompt = ${JSON.stringify(skill.body.trim())}\n`;
}

function createInstallPlanResolver(
  scope: ActivationScope,
  projectPath: string | undefined,
  skills: Map<string, SkillDefinition>,
): ManagedInstallPlanResolver {
  return ({ target, skillName, skill, previousRecord }): ManagedInstallPlan => {
    const installPath = resolveManagedInstallPath({
      scope,
      projectPath,
      target,
      skillName,
    });
    const cleanupRootPath = resolveTargetInstallBasePath({
      scope,
      projectPath,
      target,
    });
    const spec = getTargetSpec(target);

    if (spec.installKind === 'gemini-command') {
      const resolvedSkill = skill ?? skills.get(skillName);
      return {
        installPath,
        installKind: 'generated-file',
        cleanupRootPath,
        generatedContent: resolvedSkill ? buildGeminiCommandContent(resolvedSkill) : undefined,
      };
    }

    return {
      installPath,
      installKind: 'skill-directory',
      cleanupRootPath,
      preferredMode: previousRecord?.installMode === 'copy' ? 'copy' : 'symlink',
    };
  };
}

async function prepareInstallSkills(
  context: ScopedContext,
  nextState: ScopedState,
  resolvedSkills: Map<string, SkillDefinition>,
): Promise<Map<string, SkillDefinition>> {
  const installSkills = new Map(resolvedSkills);
  const missingNames = getManagedSkillNames(context.previousState).filter((name) => !installSkills.has(name));

  if (missingNames.length === 0) {
    return installSkills;
  }

  const missingSkills = await resolveKnownSkills(context.config.skillsDir, missingNames);
  for (const [name, skill] of missingSkills.entries()) {
    installSkills.set(name, skill);
  }

  for (const name of getManagedSkillNames(nextState)) {
    const skill = resolvedSkills.get(name);
    if (skill) {
      installSkills.set(name, skill);
    }
  }

  return installSkills;
}

async function removeObsoleteInstalls(
  context: ScopedContext,
  previousState: ScopedState,
  nextState: ScopedState,
  installOptions: ManagedInstallBatchOptions,
): Promise<void> {
  for (const [target, targetState] of Object.entries(previousState.targets) as Array<[TargetName, NonNullable<ActivationState['targets'][TargetName]>]>) {
    for (const [skillName, record] of Object.entries(targetState.skills)) {
      if (nextState.targets[target]?.skills[skillName]) {
        continue;
      }

      await removeManagedInstall(context.scope, target, skillName, {
        ...installOptions,
        record,
        previousRecord: record,
      });
    }
  }
}

async function reconcileState(
  context: ProjectContext,
  nextState: ProjectState,
  resolvedSkills: Map<string, SkillDefinition>,
  options?: { ensureGitignore?: boolean },
): Promise<ProjectState>;
async function reconcileState(
  context: GlobalContext,
  nextState: GlobalState,
  resolvedSkills: Map<string, SkillDefinition>,
  options?: { ensureGitignore?: boolean },
): Promise<GlobalState>;
async function reconcileState(
  context: ScopedContext,
  nextState: ScopedState,
  resolvedSkills: Map<string, SkillDefinition>,
  options?: { ensureGitignore?: boolean },
): Promise<ScopedState>;
async function reconcileState(
  context: ScopedContext,
  nextState: ScopedState,
  resolvedSkills: Map<string, SkillDefinition>,
  options: { ensureGitignore?: boolean } = {},
): Promise<ScopedState> {
  if (context.scope === 'project') {
    const projectNextState = nextState as ProjectState;
    const previousIndex = await loadProjectsIndex(context.paths.projectsFile);
    const previousIndexEntry = previousIndex.projects[context.projectPath];

    if (options.ensureGitignore) {
      await ensureProjectGitignore(context.projectPath);
    }
    await ensureProjectStateDir(context.projectPath);

    const installSkills = await prepareInstallSkills(context, projectNextState, resolvedSkills);
    const installOptions: ManagedInstallBatchOptions = {
      projectPath: context.projectPath,
      skills: installSkills,
      resolveInstallPlan: createInstallPlanResolver('project', context.projectPath, installSkills),
    };

    await preflightInstallConflicts('project', projectNextState, context.previousState, installOptions);
    await saveScopedState(context, projectNextState);

    const installChanges = await backupChangedManagedPaths('project', projectNextState, context.previousState, installOptions);

    try {
      await removeObsoleteInstalls(context, context.previousState, projectNextState, installOptions);
      const installedState = await applyManagedInstalls('project', projectNextState, context.previousState, installOptions);
      installedState.updatedAt = nowIso();
      await saveScopedState(context, installedState);

      const nextIndex = mirrorProjectState(previousIndex, installedState);
      await saveProjectsIndex(context.paths.projectsFile, nextIndex);

      await commitInstallChanges(installChanges);
      return installedState;
    } catch (error) {
      await restoreInstallChanges(installChanges);
      try {
        const rollbackState = createEmptyState('project', context.projectPath);
        await applyManagedInstalls('project', context.previousState, rollbackState, installOptions);
      } catch {
        // best-effort rollback
      }
      await restorePreviousState(context, previousIndexEntry);

      throw new SkmError('runtime', 'Failed to reconcile project state.', {
        details: error instanceof Error ? error.message : undefined,
        hint: 'Fix the reported issue and run `skm sync` to restore the state.',
        cause: error,
      });
    }
  }

  const globalNextState = nextState as GlobalState;
  const installSkills = await prepareInstallSkills(context, globalNextState, resolvedSkills);
  const installOptions: ManagedInstallBatchOptions = {
    skills: installSkills,
    resolveInstallPlan: createInstallPlanResolver('global', undefined, installSkills),
  };

  await preflightInstallConflicts('global', globalNextState, context.previousState, installOptions);
  await saveScopedState(context, globalNextState);

  const installChanges = await backupChangedManagedPaths('global', globalNextState, context.previousState, installOptions);

  try {
    await removeObsoleteInstalls(context, context.previousState, globalNextState, installOptions);
    const installedState = await applyManagedInstalls('global', globalNextState, context.previousState, installOptions);
    installedState.updatedAt = nowIso();
    await saveScopedState(context, installedState);

    await commitInstallChanges(installChanges);
    return installedState;
  } catch (error) {
    await restoreInstallChanges(installChanges);
    try {
      const rollbackState = createEmptyState('global');
      await applyManagedInstalls('global', context.previousState, rollbackState, installOptions);
    } catch {
      // best-effort rollback
    }
    await restorePreviousState(context, undefined);

    throw new SkmError('runtime', 'Failed to reconcile global state.', {
      details: error instanceof Error ? error.message : undefined,
      hint: 'Fix the reported issue and run `skm sync --global` to restore the state.',
      cause: error,
    });
  }
}

function stableUnique(names: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const name of names.map((entry) => entry.trim()).filter((entry) => entry.length > 0)) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    next.push(name);
  }
  return next;
}

export async function enableSkills(request: EnableSkillsRequest): Promise<ScopedState> {
  const scope = normalizeScope(request.scope);
  const skillNames = stableUnique(request.skillNames);
  if (skillNames.length === 0) {
    throw new SkmError('usage', 'At least one skill name is required.', {
      hint: 'Run `skm skill on <name...>`.',
    });
  }

  const context = await buildScopedContext(scope, request.projectPath);
  const presets = await listPresets();
  assertNoMissingPresetDefinitions(context.previousState.enabledPresets, presets, 'enabling skills');

  const activeTargets = resolveActiveTargets(request.targets, scope, context.config, context.previousState);
  assertEnableTargets(scope, activeTargets);

  const enabledSkills = uniqueSorted([...context.previousState.enabledSkills, ...skillNames]);
  const presetSkills = expandPresetSkillsFromMap(context.previousState.enabledPresets, presets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...enabledSkills, ...presetSkills]);
  const nextState = buildState(context, context.previousState, activeTargets, enabledSkills, context.previousState.enabledPresets, resolvedSkills);

  return reconcileState(context, nextState, resolvedSkills, { ensureGitignore: scope === 'project' });
}

export async function disableSkills(request: DisableSkillsRequest): Promise<ScopedState> {
  const scope = normalizeScope(request.scope);
  const skillNames = stableUnique(request.skillNames);
  if (skillNames.length === 0) {
    throw new SkmError('usage', 'At least one skill name is required.', {
      hint: 'Run `skm skill off <name...>`.',
    });
  }

  const context = await buildScopedContext(scope, request.projectPath);
  const presets = await listPresets();
  assertNoMissingPresetDefinitions(context.previousState.enabledPresets, presets, 'disabling skills');

  const enabledSkills = context.previousState.enabledSkills.filter((entry) => !skillNames.includes(entry));
  const presetSkills = expandPresetSkillsFromMap(context.previousState.enabledPresets, presets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...enabledSkills, ...presetSkills]);
  const activeTargets = resolvedSkills.size > 0 ? getExistingTargets(context.previousState) : [];
  const nextState = buildState(context, context.previousState, activeTargets, enabledSkills, context.previousState.enabledPresets, resolvedSkills);

  return reconcileState(context, nextState, resolvedSkills);
}

export async function enablePresets(request: EnablePresetsRequest): Promise<ScopedState> {
  const scope = normalizeScope(request.scope);
  const presetNames = stableUnique(request.presetNames);
  if (presetNames.length === 0) {
    throw new SkmError('usage', 'At least one preset name is required.', {
      hint: 'Run `skm preset on <name...>`.',
    });
  }

  const context = await buildScopedContext(scope, request.projectPath);
  const presets = await listPresets();
  const activeTargets = resolveActiveTargets(request.targets, scope, context.config, context.previousState);
  assertEnableTargets(scope, activeTargets);

  const enabledPresets = uniqueSorted([...context.previousState.enabledPresets, ...presetNames]);
  assertNoMissingPresetDefinitions(enabledPresets, presets, 'enabling presets');

  const presetSkills = expandPresetSkillsFromMap(enabledPresets, presets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...context.previousState.enabledSkills, ...presetSkills]);
  const nextState = buildState(context, context.previousState, activeTargets, context.previousState.enabledSkills, enabledPresets, resolvedSkills);

  return reconcileState(context, nextState, resolvedSkills, { ensureGitignore: scope === 'project' });
}

export async function disablePresets(request: DisablePresetsRequest): Promise<ScopedState> {
  const scope = normalizeScope(request.scope);
  const presetNames = stableUnique(request.presetNames);
  if (presetNames.length === 0) {
    throw new SkmError('usage', 'At least one preset name is required.', {
      hint: 'Run `skm preset off <name...>`.',
    });
  }

  const context = await buildScopedContext(scope, request.projectPath);
  const enabledPresets = context.previousState.enabledPresets.filter((entry) => !presetNames.includes(entry));
  const presets = await listPresets();
  assertNoMissingPresetDefinitions(enabledPresets, presets, 'disabling presets');

  const presetSkills = expandPresetSkillsFromMap(enabledPresets, presets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...context.previousState.enabledSkills, ...presetSkills]);
  const activeTargets = resolvedSkills.size > 0 ? getExistingTargets(context.previousState) : [];
  const nextState = buildState(context, context.previousState, activeTargets, context.previousState.enabledSkills, enabledPresets, resolvedSkills);

  return reconcileState(context, nextState, resolvedSkills);
}

export async function enableSkill(projectPath: string, skillName: string, requestedTargets: string[]): Promise<ProjectState> {
  return enableSkills({ scope: 'project', projectPath, skillNames: [skillName], targets: requestedTargets }) as Promise<ProjectState>;
}

export async function enablePreset(projectPath: string, presetName: string, requestedTargets: string[]): Promise<ProjectState> {
  return enablePresets({ scope: 'project', projectPath, presetNames: [presetName], targets: requestedTargets }) as Promise<ProjectState>;
}

export async function disableSkill(projectPath: string, skillName: string): Promise<ProjectState> {
  return disableSkills({ scope: 'project', projectPath, skillNames: [skillName] }) as Promise<ProjectState>;
}

export async function disablePreset(projectPath: string, presetName: string): Promise<ProjectState> {
  return disablePresets({ scope: 'project', projectPath, presetNames: [presetName] }) as Promise<ProjectState>;
}

function indexEntryEquals(left: ProjectIndexEntry | undefined, right: ProjectIndexEntry): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

async function detectUnexpectedTargetEntries(
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

function getMissingStateError(scope: ActivationScope): SkmError {
  return new SkmError('config', `${scope === 'global' ? 'Global' : 'Project'} state is missing.`, {
    hint:
      scope === 'global'
        ? 'Run `skm skill on <name> --global --target <target>` or `skm preset on <name> --global --target <target>` first.'
        : 'Run `skm skill on <name>` or `skm preset on <name>` first.',
  });
}

async function doctorScope(scope: ActivationScope, projectPath?: string): Promise<DoctorIssue[]> {
  const context = await buildScopedContext(scope, projectPath);
  if (!context.hadPreviousState) {
    throw getMissingStateError(scope);
  }

  const issues: DoctorIssue[] = [];
  const presets = await listPresets();
  const resolvedSkills = await resolveKnownSkills(context.config.skillsDir, getManagedSkillNames(context.previousState));

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

  for (const [target, targetState] of Object.entries(context.previousState.targets) as Array<[TargetName, NonNullable<ActivationState['targets'][TargetName]>]>) {
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
          } else {
            const linkTarget = await fs.readlink(installPath);
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
      } else if (record.installMode === 'copy') {
        issues.push({
          type: 'copied-skill-may-have-drifted',
          target,
          skillName,
          path: installPath,
          expectedPath: record.sourcePath,
          message: `Copy-mode installation for ${skillName} at ${installPath} may have drifted from ${record.sourcePath}.`,
        });
      } else {
        const skill = resolvedSkills.get(skillName);
        if (skill) {
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
    }
  }

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

async function syncScope(scope: ActivationScope, projectPath?: string): Promise<ScopedState> {
  const context = await buildScopedContext(scope, projectPath);
  if (!context.hadPreviousState) {
    throw getMissingStateError(scope);
  }

  const presets = await listPresets();
  assertNoMissingPresetDefinitions(context.previousState.enabledPresets, presets, `syncing the ${scope} state`);

  const unexpectedEntries = await detectUnexpectedTargetEntries(scope, getProjectPathForScope(context), context.previousState);
  if (unexpectedEntries.length > 0) {
    throw new SkmError('conflict', 'Sync refused to overwrite unexpected target entries.', {
      details: unexpectedEntries.map((issue) => issue.path).filter(Boolean).join(', '),
      hint: 'Remove the unexpected entries or update the managed state file before running sync again.',
    });
  }

  const presetSkills = expandPresetSkillsFromMap(context.previousState.enabledPresets, presets);
  const resolvedSkills = await resolveSkills(
    context.config.skillsDir,
    uniqueSorted([...context.previousState.enabledSkills, ...presetSkills]),
  );

  const nextState = {
    ...context.previousState,
    updatedAt: nowIso(),
  } as typeof context.previousState;

  return reconcileState(context, nextState, resolvedSkills);
}

export async function syncProject(projectPath: string): Promise<ProjectState> {
  return syncScope('project', projectPath) as Promise<ProjectState>;
}

export async function syncGlobal(): Promise<GlobalState> {
  return syncScope('global') as Promise<GlobalState>;
}
