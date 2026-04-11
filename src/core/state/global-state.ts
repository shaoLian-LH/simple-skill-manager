import { getGlobalPaths, type GlobalPaths } from '../config/paths.js';
import { SkmError } from '../errors.js';
import type { GlobalState } from '../types.js';
import { pathExists, readJsonFile, writeJsonFileAtomic } from '../utils/fs.js';
import { createEmptyActivationState, validateActivationState } from './shared.js';

export function getGlobalStatePath(paths?: GlobalPaths): string {
  return (paths ?? getGlobalPaths()).globalStateFile;
}

export function createEmptyGlobalState(now?: string): GlobalState {
  return createEmptyActivationState(now);
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
  validateActivationState(state, sourcePath, {
    scopeLabel: 'Global',
    versionHint: 'Recreate the global state file using the current CLI.',
  });
}
