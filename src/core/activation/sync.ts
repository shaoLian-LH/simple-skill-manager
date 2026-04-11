import { SkmError } from '../errors.js';
import { listPresets } from '../registry/presets.js';
import type { ActivationScope, GlobalState, ProjectState, ScopedState } from '../types.js';
import { uniqueSorted } from '../utils/collection.js';
import { nowIso } from '../utils/time.js';
import { buildScopedContext, getProjectPathForScope } from './context.js';
import { detectUnexpectedTargetEntries, getMissingStateError } from './doctor.js';
import { reconcileState } from './reconcile.js';
import { assertNoMissingPresetDefinitions, expandPresetSkillsFromMap, resolveSkills } from './skill-resolution.js';

export async function syncScope(scope: ActivationScope, projectPath?: string): Promise<ScopedState> {
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
