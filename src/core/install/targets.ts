import path from 'node:path';

import { SkmError } from '../errors.js';
import { SUPPORTED_TARGETS, type TargetName } from '../types.js';

export function isSupportedTarget(value: string): value is TargetName {
  return SUPPORTED_TARGETS.includes(value as TargetName);
}

export function assertSupportedTargets(targets: string[]): asserts targets is TargetName[] {
  for (const target of targets) {
    if (!isSupportedTarget(target)) {
      throw new SkmError('usage', `Unsupported target "${target}".`, {
        hint: `Use one of: ${SUPPORTED_TARGETS.join(', ')}`,
      });
    }
  }
}

export function resolveSkillInstallPath(projectPath: string, target: TargetName, skillName: string): string {
  return path.join(projectPath, target, 'skills', skillName);
}
