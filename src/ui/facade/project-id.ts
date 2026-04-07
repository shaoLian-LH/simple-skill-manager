import { SkmError } from '../../core/errors.js';

const PROJECT_ID_PREFIX = 'p_';

export function encodeProjectId(projectPath: string): string {
  return `${PROJECT_ID_PREFIX}${Buffer.from(projectPath, 'utf8').toString('base64url')}`;
}

export function decodeProjectId(projectId: string): string {
  if (!projectId.startsWith(PROJECT_ID_PREFIX)) {
    throw new SkmError('usage', `Invalid projectId: ${projectId}.`, {
      hint: 'Use project identifiers returned by `GET /api/projects`.',
    });
  }

  const encodedPath = projectId.slice(PROJECT_ID_PREFIX.length);
  if (encodedPath.length === 0) {
    throw new SkmError('usage', 'Invalid empty projectId payload.', {
      hint: 'Use project identifiers returned by `GET /api/projects`.',
    });
  }

  try {
    const projectPath = Buffer.from(encodedPath, 'base64url').toString('utf8');
    if (projectPath.length === 0) {
      throw new Error('decoded project path is empty');
    }

    return projectPath;
  } catch (error) {
    throw new SkmError('usage', `Invalid projectId: ${projectId}.`, {
      details: error instanceof Error ? error.message : undefined,
      hint: 'Use project identifiers returned by `GET /api/projects`.',
      cause: error,
    });
  }
}

