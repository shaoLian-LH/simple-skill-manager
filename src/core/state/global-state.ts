import { STATE_VERSION } from '../constants.js';
import { getGlobalPaths, type GlobalPaths } from '../config/paths.js';
import { SkmError } from '../errors.js';
import { assertSupportedTargets } from '../install/targets.js';
import type { GlobalState } from '../types.js';
import { pathExists, readJsonFile, writeJsonFileAtomic } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';

export function getGlobalStatePath(paths?: GlobalPaths): string {
  return (paths ?? getGlobalPaths()).globalStateFile;
}

export function createEmptyGlobalState(now = nowIso()): GlobalState {
  return {
    version: STATE_VERSION,
    targets: {},
    enabledSkills: [],
    enabledPresets: [],
    updatedAt: now,
  };
}

export async function loadGlobalState(paths?: GlobalPaths): Promise<GlobalState | null> {
  const statePath = getGlobalStatePath(paths);
  if (!(await pathExists(statePath))) {
    return null;
  }

  try {
    const parsed = await readJsonFile<GlobalState>(statePath);
    validateGlobalState(parsed, statePath);
    return parsed;
  } catch (error) {
    throw new SkmError('config', 'Failed to read global state file.', {
      details: statePath,
      hint: 'Fix or remove the invalid global state file and run the command again.',
      cause: error,
    });
  }
}

export async function saveGlobalState(state: GlobalState, paths?: GlobalPaths): Promise<void> {
  const statePath = getGlobalStatePath(paths);
  validateGlobalState(state, statePath);
  await writeJsonFileAtomic(statePath, state);
}

function validateGlobalState(state: GlobalState, sourcePath: string): void {
  if (state.version !== STATE_VERSION) {
    throw new SkmError('config', 'Global state version is unsupported.', {
      details: `${sourcePath}: version=${String(state.version)}`,
      hint: 'Recreate the global state file using the current CLI.',
    });
  }

  if (!state.targets || typeof state.targets !== 'object') {
    throw new SkmError('config', 'Global state has invalid targets.', {
      details: sourcePath,
    });
  }

  assertSupportedTargets(Object.keys(state.targets));

  if (!Array.isArray(state.enabledSkills) || !Array.isArray(state.enabledPresets)) {
    throw new SkmError('config', 'Global state has invalid enabled arrays.', {
      details: sourcePath,
    });
  }
}
