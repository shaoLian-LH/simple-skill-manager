import path from 'node:path';

import {
  PROJECT_STATE_DIR,
  PROJECT_STATE_FILE,
} from '../constants.js';
import { SkmError } from '../errors.js';
import type { ProjectState } from '../types.js';
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic } from '../utils/fs.js';
import { createEmptyActivationState, validateActivationState } from './shared.js';

export function getProjectStateDir(projectPath: string): string {
  return path.join(projectPath, PROJECT_STATE_DIR);
}

export function getProjectStatePath(projectPath: string): string {
  return path.join(getProjectStateDir(projectPath), PROJECT_STATE_FILE);
}

export async function ensureProjectStateDir(projectPath: string): Promise<void> {
  await ensureDir(getProjectStateDir(projectPath));
}

export function createEmptyProjectState(projectPath: string, now?: string): ProjectState {
  return {
    ...createEmptyActivationState(now),
    projectPath,
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
  validateActivationState(state, sourcePath, {
    scopeLabel: 'Project',
    versionHint: 'Recreate the state file using the current CLI.',
  });

  if (!state.projectPath || typeof state.projectPath !== 'string') {
    throw new SkmError('config', 'Project state is missing projectPath.', {
      details: sourcePath,
    });
  }
}
