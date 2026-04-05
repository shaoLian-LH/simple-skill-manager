import path from 'node:path';

import {
  PROJECT_STATE_DIR,
  PROJECT_STATE_FILE,
  STATE_VERSION,
} from '../constants.js';
import { SkmError } from '../errors.js';
import type { ProjectState } from '../types.js';
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';

export function getProjectStateDir(projectPath: string): string {
  return path.join(projectPath, PROJECT_STATE_DIR);
}

export function getProjectStatePath(projectPath: string): string {
  return path.join(getProjectStateDir(projectPath), PROJECT_STATE_FILE);
}

export async function ensureProjectStateDir(projectPath: string): Promise<void> {
  await ensureDir(getProjectStateDir(projectPath));
}

export function createEmptyProjectState(projectPath: string, now = nowIso()): ProjectState {
  return {
    version: STATE_VERSION,
    projectPath,
    targets: {},
    enabledSkills: [],
    enabledPresets: [],
    updatedAt: now,
  };
}

export async function loadProjectState(projectPath: string): Promise<ProjectState | null> {
  const statePath = getProjectStatePath(projectPath);
  if (!(await pathExists(statePath))) {
    return null;
  }

  try {
    const parsed = await readJsonFile<ProjectState>(statePath);
    validateProjectState(parsed, statePath);
    return parsed;
  } catch (error) {
    throw new SkmError('config', 'Failed to read project state file.', {
      details: statePath,
      hint: 'Fix or remove the invalid state file and run the command again.',
      cause: error,
    });
  }
}

export async function saveProjectState(projectPath: string, state: ProjectState): Promise<void> {
  const statePath = getProjectStatePath(projectPath);
  validateProjectState(state, statePath);
  await writeJsonFileAtomic(statePath, state);
}

function validateProjectState(state: ProjectState, sourcePath: string): void {
  if (state.version !== STATE_VERSION) {
    throw new SkmError('config', 'Project state version is unsupported.', {
      details: `${sourcePath}: version=${String(state.version)}`,
      hint: 'Recreate the state file using the current CLI.',
    });
  }

  if (!state.projectPath || typeof state.projectPath !== 'string') {
    throw new SkmError('config', 'Project state is missing projectPath.', {
      details: sourcePath,
    });
  }

  if (!state.targets || typeof state.targets !== 'object') {
    throw new SkmError('config', 'Project state has invalid targets.', {
      details: sourcePath,
    });
  }

  if (!Array.isArray(state.enabledSkills) || !Array.isArray(state.enabledPresets)) {
    throw new SkmError('config', 'Project state has invalid enabled arrays.', {
      details: sourcePath,
    });
  }
}
