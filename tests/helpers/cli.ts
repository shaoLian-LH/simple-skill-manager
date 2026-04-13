import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliEntry = path.join(repoRoot, 'src/bin/skm.ts');
const tsxLoader = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs');

export interface RunCliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runCli(args: string[], options: RunCliOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, ['--import', tsxLoader, cliEntry, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

export async function runCliJson(args: string[], options: RunCliOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return runCli(['--json', ...args], options);
}

export async function runCliExpectFailure(
  args: string[],
  options: RunCliOptions = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  try {
    await runCli(args, options);
    throw new Error(`Expected command to fail: ${args.join(' ')}`);
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | null | string;
    };

    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      code: typeof failure.code === 'number' ? failure.code : null,
    };
  }
}
