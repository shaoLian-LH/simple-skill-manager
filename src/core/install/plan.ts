import path from 'node:path';

import { SkmError } from '../errors.js';
import type { ActivationScope, InstallMode, InstalledSkillRecord, SkillDefinition, TargetName } from '../types.js';
import { getTargetSpec, resolveManagedInstallPath, resolveTargetInstallBasePath } from './targets.js';

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

export function resolveManagedInstallPlan(
  input: ManagedInstallPlanResolverInput,
  resolver?: ManagedInstallPlanResolver,
): ManagedInstallPlan {
  const fallbackPlan: ManagedInstallPlan =
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

export function getGeneratedContentOrThrow(plan: ManagedInstallPlan): string {
  if (typeof plan.generatedContent === 'string') {
    return plan.generatedContent;
  }

  throw new SkmError('runtime', 'Generated install plan is missing content.', {
    details: `Install path: ${plan.installPath}`,
  });
}
