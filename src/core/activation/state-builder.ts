import { STATE_VERSION } from '../constants.js';
import { SkmError } from '../errors.js';
import { assertSupportedTargets, getTargetSpec } from '../install/targets.js';
import type { ActivationScope, ActivationState, Config, InstallMode, ScopedState, SkillDefinition, TargetName } from '../types.js';
import { uniqueSorted } from '../utils/collection.js';
import { nowIso } from '../utils/time.js';
import type { ScopedContext } from './context.js';

export function getExistingTargets(state: ActivationState): TargetName[] {
  return Object.keys(state.targets) as TargetName[];
}

export function getManagedSkillNames(state: ActivationState): string[] {
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

export function resolveActiveTargets(
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

export function assertEnableTargets(scope: ActivationScope, activeTargets: TargetName[]): void {
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

export function buildState(
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
