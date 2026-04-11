import { CONFIG_VERSION, createDefaultProjectsIndex } from '../constants.js';
import { SkmError } from '../errors.js';
import type { ProjectIndexEntry, ProjectState, ProjectsIndex, TargetName } from '../types.js';
import { pathExists, readJsonFile, writeJsonFileAtomic } from '../utils/fs.js';

export async function loadProjectsIndex(projectsFilePath: string): Promise<ProjectsIndex> {
  if (!(await pathExists(projectsFilePath))) {
    return createDefaultProjectsIndex();
  }

  try {
    const parsed = await readJsonFile<ProjectsIndex>(projectsFilePath);
    validateProjectsIndex(parsed, projectsFilePath);
    return parsed;
  } catch (error) {
    throw new SkmError('config', 'Failed to read global projects index.', {
      details: projectsFilePath,
      hint: 'Fix or remove the invalid projects.json file and run the command again.',
      cause: error,
    });
  }
}

export async function saveProjectsIndex(projectsFilePath: string, index: ProjectsIndex): Promise<void> {
  validateProjectsIndex(index, projectsFilePath);
  await writeJsonFileAtomic(projectsFilePath, index);
}

export function mirrorProjectState(index: ProjectsIndex, state: ProjectState): ProjectsIndex {
  const next = cloneProjectsIndex(index);
  if (state.enabledSkills.length === 0 && state.enabledPresets.length === 0 && Object.keys(state.targets).length === 0) {
    delete next.projects[state.projectPath];
    return next;
  }

  next.projects[state.projectPath] = createProjectIndexEntry(state);
  return next;
}

export function createProjectIndexEntry(state: ProjectState): ProjectIndexEntry {
  const targets = Object.entries(state.targets)
    .filter(([, targetState]) => Boolean(targetState && Object.keys(targetState.skills).length > 0))
    .map(([target]) => target as TargetName)
    .sort((left, right) => left.localeCompare(right));

  return {
    targets,
    enabledSkills: [...state.enabledSkills].sort((left, right) => left.localeCompare(right)),
    enabledPresets: [...state.enabledPresets].sort((left, right) => left.localeCompare(right)),
    updatedAt: state.updatedAt,
  };
}

function validateProjectsIndex(index: ProjectsIndex, sourcePath: string): void {
  if (index.version !== CONFIG_VERSION) {
    throw new SkmError('config', 'Projects index version is unsupported.', {
      details: `${sourcePath}: version=${String(index.version)}`,
      hint: 'Recreate the projects index using `skm config init`.',
    });
  }

  if (!index.projects || typeof index.projects !== 'object') {
    throw new SkmError('config', 'Projects index has invalid projects map.', {
      details: sourcePath,
    });
  }
}

function cloneProjectsIndex(index: ProjectsIndex): ProjectsIndex {
  return structuredClone(index);
}
