import { SkmError } from '../../core/errors.js';
import { translateUiText, type UiLocale } from '../text.js';

export interface FolderPickView {
  path: string | null;
  canceled: boolean;
}

export type FolderPickerDependency = (prompt: string) => Promise<string>;

interface PickSkillsDirectoryOptions {
  locale: UiLocale;
  picker?: FolderPickerDependency;
}

function isPickerCancellationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /user canceled/i.test(error.message) || /\(-128\)/.test(error.message);
}

async function loadMacFolderPicker(): Promise<FolderPickerDependency> {
  const module = (await import('macos-open-file-dialog')) as {
    openFolder?: FolderPickerDependency;
    default?: {
      openFolder?: FolderPickerDependency;
    };
  };

  const picker = module.openFolder ?? module.default?.openFolder;
  if (typeof picker !== 'function') {
    throw new SkmError('runtime', 'Folder picker package did not expose `openFolder`.');
  }

  return picker;
}

export function isNativeFolderPickerSupported(platform = process.platform): boolean {
  return platform === 'darwin';
}

export async function pickSkillsDirectory(options: PickSkillsDirectoryOptions): Promise<FolderPickView> {
  const picker = options.picker ?? (await loadMacFolderPicker());

  try {
    const selectedPath = (await picker(translateUiText(options.locale, 'config.folderPickerPrompt'))).trim();
    return {
      path: selectedPath.length > 0 ? selectedPath : null,
      canceled: false,
    };
  } catch (error) {
    if (isPickerCancellationError(error)) {
      return {
        path: null,
        canceled: true,
      };
    }

    throw new SkmError('runtime', translateUiText(options.locale, 'config.folderPickerFailed'), {
      details: error instanceof Error ? error.message : String(error),
      hint: translateUiText(options.locale, 'config.folderPickerFailedHint'),
      cause: error,
    });
  }
}
