import {
  DEFAULT_UI_LOCALE,
  formatUiRelativeTime,
  translateUiText,
  type UiLocale,
} from '../../../../text.js';

export function getLastPathSegment(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? input;
}

export function getProjectLabel(projectPath: string, locale: UiLocale = DEFAULT_UI_LOCALE): string {
  if (!projectPath) {
    return translateUiText(locale, 'common.untitledProject');
  }

  return getLastPathSegment(projectPath);
}

export function formatRelativeTime(
  value?: string,
  now = Date.now(),
  locale: UiLocale = DEFAULT_UI_LOCALE,
): string {
  return formatUiRelativeTime(locale, value, now);
}
