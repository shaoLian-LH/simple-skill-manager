import { translateUiText, type UiLocale } from '../../../text.js';

import type { PresetDeletePreviewView } from '../types';

export function buildPresetDeleteConfirmationMessage(
  preview: PresetDeletePreviewView,
  locale: UiLocale,
): string {
  if (preview.referenceProjects.length === 0) {
    return translateUiText(locale, 'presetDetail.deleteConfirmEmpty', { name: preview.name });
  }

  const affectedProjects = preview.referenceProjects
    .slice(0, 8)
    .map((project) => `- ${project.projectPath}`)
    .join('\n');
  const overflowSuffix = preview.referenceProjects.length > 8 ? '\n- ...' : '';

  return translateUiText(locale, 'presetDetail.deleteConfirmWithRefs', {
    name: preview.name,
    count: preview.referenceCount,
    projects: affectedProjects + overflowSuffix,
  });
}
