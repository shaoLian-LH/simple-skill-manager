import {
  applyManagedInstalls,
  backupChangedManagedPaths,
  commitInstallChanges,
  preflightInstallConflicts,
  removeManagedInstall,
  restoreInstallChanges,
  type ManagedInstallBatchOptions,
} from '../install/installer.js';
import { ensureProjectGitignore } from '../project/gitignore.js';
import { loadProjectsIndex, mirrorProjectState, saveProjectsIndex } from '../project/projects-index.js';
import { ensureProjectStateDir } from '../state/project-state.js';
import { SkmError } from '../errors.js';
import type { ActivationState, GlobalState, ProjectState, ScopedState, SkillDefinition, TargetName } from '../types.js';
import { nowIso } from '../utils/time.js';
import { createEmptyState, restorePreviousState, saveScopedState, type GlobalContext, type ProjectContext, type ScopedContext } from './context.js';
import { createInstallPlanResolver } from './install-plan.js';
import { resolveKnownSkills } from './skill-resolution.js';
import { getManagedSkillNames } from './state-builder.js';

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

export async function reconcileState(
  context: ProjectContext,
  nextState: ProjectState,
  resolvedSkills: Map<string, SkillDefinition>,
  options?: { ensureGitignore?: boolean },
): Promise<ProjectState>;
export async function reconcileState(
  context: GlobalContext,
  nextState: GlobalState,
  resolvedSkills: Map<string, SkillDefinition>,
  options?: { ensureGitignore?: boolean },
): Promise<GlobalState>;
export async function reconcileState(
  context: ScopedContext,
  nextState: ScopedState,
  resolvedSkills: Map<string, SkillDefinition>,
  options?: { ensureGitignore?: boolean },
): Promise<ScopedState>;
export async function reconcileState(
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
