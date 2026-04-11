import {
  getTargetSpec,
  resolveManagedInstallPath,
  resolveTargetInstallBasePath,
} from '../install/targets.js';
import type { ManagedInstallPlan, ManagedInstallPlanResolver } from '../install/installer.js';
import type { ActivationScope, SkillDefinition } from '../types.js';

export function buildGeminiCommandContent(skill: SkillDefinition): string {
  return `description = ${JSON.stringify(skill.description)}\nprompt = ${JSON.stringify(skill.body.trim())}\n`;
}

export function createInstallPlanResolver(
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
