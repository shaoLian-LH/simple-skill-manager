import path from 'node:path';

import { appendLineIfMissing } from '../utils/fs.js';

export function getProjectGitignorePath(projectPath: string): string {
  return path.join(projectPath, '.gitignore');
}

export async function ensureProjectGitignore(projectPath: string): Promise<boolean> {
  return appendLineIfMissing(getProjectGitignorePath(projectPath), '.skm');
}
