import { SkmError } from '../errors.js';
import { listPresets } from '../registry/presets.js';
import type { ActivationScope, GlobalState, ProjectState, ScopedState } from '../types.js';
import { stableUnique, uniqueSorted } from '../utils/collection.js';
import { buildScopedContext, normalizeScope } from './context.js';
import { doctorGlobal, doctorProject } from './doctor.js';
import { reconcileState } from './reconcile.js';
import { assertNoMissingPresetDefinitions, expandPresetSkillsFromMap, resolveSkills } from './skill-resolution.js';
import { assertEnableTargets, buildState, getExistingTargets, resolveActiveTargets } from './state-builder.js';
import { syncGlobal, syncProject } from './sync.js';

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

function assertNamesPresent(names: string[], resourceLabel: string, hint: string): void {
  if (names.length > 0) {
    return;
  }

  throw new SkmError('usage', `At least one ${resourceLabel} name is required.`, {
    hint,
  });
}

export async function enableSkills(request: EnableSkillsRequest): Promise<ScopedState> {
  const scope = normalizeScope(request.scope);
  const skillNames = stableUnique(request.skillNames);
  assertNamesPresent(skillNames, 'skill', 'Run `skm skill on <name...>`.');

  const context = await buildScopedContext(scope, request.projectPath);
  const presets = await listPresets();
  assertNoMissingPresetDefinitions(context.previousState.enabledPresets, presets, 'enabling skills');

  const activeTargets = resolveActiveTargets(request.targets, scope, context.config, context.previousState);
  assertEnableTargets(scope, activeTargets);

  const enabledSkills = uniqueSorted([...context.previousState.enabledSkills, ...skillNames]);
  const presetSkills = expandPresetSkillsFromMap(context.previousState.enabledPresets, presets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...enabledSkills, ...presetSkills]);
  const nextState = buildState(
    context,
    context.previousState,
    activeTargets,
    enabledSkills,
    context.previousState.enabledPresets,
    resolvedSkills,
  );

  return reconcileState(context, nextState, resolvedSkills, { ensureGitignore: scope === 'project' });
}

export async function disableSkills(request: DisableSkillsRequest): Promise<ScopedState> {
  const scope = normalizeScope(request.scope);
  const skillNames = stableUnique(request.skillNames);
  assertNamesPresent(skillNames, 'skill', 'Run `skm skill off <name...>`.');

  const context = await buildScopedContext(scope, request.projectPath);
  const presets = await listPresets();
  assertNoMissingPresetDefinitions(context.previousState.enabledPresets, presets, 'disabling skills');

  const enabledSkills = context.previousState.enabledSkills.filter((entry) => !skillNames.includes(entry));
  const presetSkills = expandPresetSkillsFromMap(context.previousState.enabledPresets, presets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...enabledSkills, ...presetSkills]);
  const activeTargets = resolvedSkills.size > 0 ? getExistingTargets(context.previousState) : [];
  const nextState = buildState(
    context,
    context.previousState,
    activeTargets,
    enabledSkills,
    context.previousState.enabledPresets,
    resolvedSkills,
  );

  return reconcileState(context, nextState, resolvedSkills);
}

export async function enablePresets(request: EnablePresetsRequest): Promise<ScopedState> {
  const scope = normalizeScope(request.scope);
  const presetNames = stableUnique(request.presetNames);
  assertNamesPresent(presetNames, 'preset', 'Run `skm preset on <name...>`.');

  const context = await buildScopedContext(scope, request.projectPath);
  const presets = await listPresets();
  const activeTargets = resolveActiveTargets(request.targets, scope, context.config, context.previousState);
  assertEnableTargets(scope, activeTargets);

  const enabledPresets = uniqueSorted([...context.previousState.enabledPresets, ...presetNames]);
  assertNoMissingPresetDefinitions(enabledPresets, presets, 'enabling presets');

  const presetSkills = expandPresetSkillsFromMap(enabledPresets, presets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...context.previousState.enabledSkills, ...presetSkills]);
  const nextState = buildState(
    context,
    context.previousState,
    activeTargets,
    context.previousState.enabledSkills,
    enabledPresets,
    resolvedSkills,
  );

  return reconcileState(context, nextState, resolvedSkills, { ensureGitignore: scope === 'project' });
}

export async function disablePresets(request: DisablePresetsRequest): Promise<ScopedState> {
  const scope = normalizeScope(request.scope);
  const presetNames = stableUnique(request.presetNames);
  assertNamesPresent(presetNames, 'preset', 'Run `skm preset off <name...>`.');

  const context = await buildScopedContext(scope, request.projectPath);
  const enabledPresets = context.previousState.enabledPresets.filter((entry) => !presetNames.includes(entry));
  const presets = await listPresets();
  assertNoMissingPresetDefinitions(enabledPresets, presets, 'disabling presets');

  const presetSkills = expandPresetSkillsFromMap(enabledPresets, presets);
  const resolvedSkills = await resolveSkills(context.config.skillsDir, [...context.previousState.enabledSkills, ...presetSkills]);
  const activeTargets = resolvedSkills.size > 0 ? getExistingTargets(context.previousState) : [];
  const nextState = buildState(
    context,
    context.previousState,
    activeTargets,
    context.previousState.enabledSkills,
    enabledPresets,
    resolvedSkills,
  );

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

export { doctorGlobal, doctorProject, syncGlobal, syncProject };
