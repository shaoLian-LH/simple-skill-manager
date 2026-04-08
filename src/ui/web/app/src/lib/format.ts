import {
  DEFAULT_UI_LOCALE,
  formatUiRelativeTime,
  translateUiText,
  type UiLocale,
} from '../../../../text.js';

export function getProjectLabel(projectPath: string, locale: UiLocale = DEFAULT_UI_LOCALE): string {
  if (!projectPath) {
    return translateUiText(locale, 'common.untitledProject');
  }

  const normalized = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? projectPath;
}

export function formatRelativeTime(
  value?: string,
  now = Date.now(),
  locale: UiLocale = DEFAULT_UI_LOCALE,
): string {
  return formatUiRelativeTime(locale, value, now);
}
