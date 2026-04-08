import type { IncomingMessage } from 'node:http';

import { DEFAULT_UI_LOCALE, normalizeUiLocale, parseUiLocale, type UiLocale } from '../text.js';

export function resolveRequestUiLocale(request: IncomingMessage): UiLocale {
  const headerLocale = parseUiLocale(request.headers['x-skm-lang']);
  if (headerLocale) {
    return headerLocale;
  }

  if (!request.url) {
    return DEFAULT_UI_LOCALE;
  }

  const parsed = new URL(request.url, 'http://localhost');
  return normalizeUiLocale(parsed.searchParams.get('lang'));
}
