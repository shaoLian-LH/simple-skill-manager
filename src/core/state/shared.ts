import { STATE_VERSION } from '../constants.js';
import { SkmError } from '../errors.js';
import { assertSupportedTargets } from '../install/targets.js';
import type { ActivationState } from '../types.js';
import { nowIso } from '../utils/time.js';

export function createEmptyActivationState(now = nowIso()): ActivationState {
  return {
    version: STATE_VERSION,
    targets: {},
    enabledSkills: [],
    enabledPresets: [],
    updatedAt: now,
  };
}

export function validateActivationState(
  state: ActivationState,
  sourcePath: string,
  options: { scopeLabel: string; versionHint: string },
): void {
  if (state.version !== STATE_VERSION) {
    throw new SkmError('config', `${options.scopeLabel} state version is unsupported.`, {
      details: `${sourcePath}: version=${String(state.version)}`,
      hint: options.versionHint,
    });
  }

  if (!state.targets || typeof state.targets !== 'object') {
    throw new SkmError('config', `${options.scopeLabel} state has invalid targets.`, {
      details: sourcePath,
    });
  }

  assertSupportedTargets(Object.keys(state.targets));

  if (!Array.isArray(state.enabledSkills) || !Array.isArray(state.enabledPresets)) {
    throw new SkmError('config', `${options.scopeLabel} state has invalid enabled arrays.`, {
      details: sourcePath,
    });
  }
}
