import { loadConfig } from '../config/service.js';
import { removePath } from '../utils/fs.js';
import { loadProjectsIndex, saveProjectsIndex } from '../project/projects-index.js';
import { SkmError } from '../errors.js';
import { createEmptyGlobalState, getGlobalStatePath, loadGlobalState, saveGlobalState } from '../state/global-state.js';
import {
  createEmptyProjectState,
  getProjectStateDir,
  getProjectStatePath,
  loadProjectState,
  saveProjectState,
} from '../state/project-state.js';
import type { ActivationScope, Config, GlobalState, ProjectIndexEntry, ProjectState, ScopedState } from '../types.js';

type LoadedPaths = Awaited<ReturnType<typeof loadConfig>>['paths'];

export interface ProjectContext {
  scope: 'project';
  projectPath: string;
  config: Config;
  previousState: ProjectState;
  hadPreviousState: boolean;
  paths: LoadedPaths;
}

export interface GlobalContext {
  scope: 'global';
  config: Config;
  previousState: GlobalState;
  hadPreviousState: boolean;
  paths: LoadedPaths;
}

export type ScopedContext = ProjectContext | GlobalContext;

export function normalizeScope(scope?: ActivationScope): ActivationScope {
  return scope ?? 'project';
}

export function requireProjectPath(projectPath: string | undefined): string {
  if (!projectPath || projectPath.trim().length === 0) {
    throw new SkmError('usage', 'Project path is required for project-scoped operations.', {
      hint: 'Run the command inside a project directory or provide a project path.',
    });
  }

  return projectPath;
}

export function getProjectPathForScope(context: ScopedContext): string | undefined {
  return context.scope === 'project' ? context.projectPath : undefined;
}

export function createEmptyState(scope: 'project', projectPath: string): ProjectState;
export function createEmptyState(scope: 'global'): GlobalState;
export function createEmptyState(scope: ActivationScope, projectPath?: string): ScopedState;
export function createEmptyState(scope: ActivationScope, projectPath?: string): ScopedState {
  if (scope === 'project') {
    return createEmptyProjectState(requireProjectPath(projectPath));
  }

  return createEmptyGlobalState();
}

export async function buildScopedContext(scope: 'project', projectPath: string): Promise<ProjectContext>;
export async function buildScopedContext(scope: 'global'): Promise<GlobalContext>;
export async function buildScopedContext(scope: ActivationScope, projectPath?: string): Promise<ScopedContext>;
export async function buildScopedContext(scope: ActivationScope, projectPath?: string): Promise<ScopedContext> {
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

export async function saveScopedState(context: ProjectContext, state: ProjectState): Promise<void>;
export async function saveScopedState(context: GlobalContext, state: GlobalState): Promise<void>;
export async function saveScopedState(context: ScopedContext, state: ScopedState): Promise<void>;
export async function saveScopedState(context: ScopedContext, state: ScopedState): Promise<void> {
  if (context.scope === 'project') {
    await saveProjectState(context.projectPath, state as ProjectState);
    return;
  }

  await saveGlobalState(state as GlobalState, context.paths);
}

export async function removeScopedState(context: ScopedContext): Promise<void> {
  if (context.scope === 'project') {
    await removePath(getProjectStatePath(context.projectPath));
    await removePath(getProjectStateDir(context.projectPath));
    return;
  }

  await removePath(getGlobalStatePath(context.paths));
}

export async function restorePreviousState(context: ScopedContext, previousIndexEntry: ProjectIndexEntry | undefined): Promise<void> {
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
