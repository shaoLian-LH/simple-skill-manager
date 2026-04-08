import { spawn } from 'node:child_process';

import type { QuickOpenView } from '../contracts/api.js';
import { DEFAULT_UI_LOCALE, translateUiText, type UiLocale } from '../text.js';

export type RunSystemCommand = (command: string, args: string[]) => Promise<void>;

function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runSystemCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: false,
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${String(code)}.`));
    });
  });
}

async function openWithDefaultSystemHandler(projectPath: string, runner: RunSystemCommand): Promise<void> {
  if (process.platform === 'darwin') {
    await runner('open', [projectPath]);
    return;
  }

  if (process.platform === 'win32') {
    await runner('cmd', ['/c', 'start', '', projectPath]);
    return;
  }

  await runner('xdg-open', [projectPath]);
}

export async function quickOpenProjectPath(
  projectPath: string,
  runner: RunSystemCommand = runSystemCommand,
  locale: UiLocale = DEFAULT_UI_LOCALE,
): Promise<QuickOpenView> {
  try {
    await runner('code', [projectPath]);
    return {
      success: true,
      strategy: 'code',
      message: translateUiText(locale, 'quickOpen.openedInCode'),
    };
  } catch (codeError) {
    try {
      await openWithDefaultSystemHandler(projectPath, runner);
      return {
        success: true,
        strategy: 'default',
        message: translateUiText(locale, 'quickOpen.openedWithSystem'),
      };
    } catch (fallbackError) {
      return {
        success: false,
        strategy: null,
        message: translateUiText(locale, 'quickOpen.failed', {
          codeError: formatCommandError(codeError),
          defaultError: formatCommandError(fallbackError),
        }),
      };
    }
  }
}
