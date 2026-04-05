import os from 'node:os';
import path from 'node:path';

export function expandHomePath(inputPath: string): string {
  if (inputPath === '~') {
    return os.homedir();
  }

  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

export function resolveUserPath(inputPath: string, cwd = process.cwd()): string {
  return path.resolve(cwd, expandHomePath(inputPath));
}

export function toDisplayPath(inputPath: string): string {
  const home = os.homedir();
  return inputPath.startsWith(home) ? inputPath.replace(home, '~') : inputPath;
}
