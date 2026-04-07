import os from 'node:os';
import path from 'node:path';

import { SkmError } from '../errors.js';
import { SUPPORTED_TARGETS, TARGET_REGISTRY, type ActivationScope, type TargetName, type TargetSpec } from '../types.js';

export interface TargetPathRequest {
  scope: ActivationScope;
  target: TargetName;
  projectPath?: string;
  homeDir?: string;
}

export interface ManagedInstallPathRequest extends TargetPathRequest {
  skillName: string;
}

function assertProjectPath(request: TargetPathRequest): string {
  if (request.scope === 'project' && !request.projectPath) {
    throw new SkmError('usage', 'Project path is required for project-scoped target resolution.');
  }

  return request.projectPath ?? '';
}

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

export function getTargetSpec(target: TargetName): TargetSpec {
  return TARGET_REGISTRY[target];
}

export function getSupportedTargetSpecs(): TargetSpec[] {
  return SUPPORTED_TARGETS.map((target) => getTargetSpec(target));
}

export function resolveTargetRootPath(request: TargetPathRequest): string {
  const spec = getTargetSpec(request.target);

  if (request.scope === 'project') {
    return path.join(assertProjectPath(request), spec.projectRootDir);
  }

  return path.join(request.homeDir ?? os.homedir(), spec.globalRootDir);
}

export function resolveTargetInstallBasePath(request: TargetPathRequest): string {
  const spec = getTargetSpec(request.target);
  const installBase = request.scope === 'project' ? spec.localInstallBase : spec.globalInstallBase;
  return path.join(resolveTargetRootPath(request), installBase);
}

export function resolveManagedInstallPath(request: ManagedInstallPathRequest): string {
  const spec = getTargetSpec(request.target);
  const installBasePath = resolveTargetInstallBasePath(request);

  if (spec.installKind === 'gemini-command') {
    return path.join(installBasePath, `${request.skillName}.toml`);
  }

  return path.join(installBasePath, request.skillName);
}

export function describeTargetInstallLocation(request: TargetPathRequest): string {
  const installBasePath = resolveTargetInstallBasePath(request);
  if (request.scope === 'project') {
    return path.relative(request.projectPath ?? '', installBasePath).split(path.sep).join('/');
  }

  const homeDir = request.homeDir ?? os.homedir();
  const relativePath = path.relative(homeDir, installBasePath).split(path.sep).join('/');
  return relativePath.length > 0 ? `~/${relativePath}` : '~';
}

export function resolveSkillInstallPath(projectPath: string, target: TargetName, skillName: string): string {
  return resolveManagedInstallPath({
    scope: 'project',
    projectPath,
    target,
    skillName,
  });
}
