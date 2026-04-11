import { computed, ref, type ComputedRef } from 'vue';
import { useRoute } from 'vue-router';

import {
  DEFAULT_UI_LOCALE,
  formatUiDateTime,
  formatUiRelativeTime,
  normalizeUiLocale,
  parseUiLocale,
  translateUiText,
  type UiLocale,
} from '../../../text.js';

const currentLocale = ref<UiLocale>(DEFAULT_UI_LOCALE);

function syncDocumentLanguage(locale: UiLocale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export function getCurrentUiLocale(): UiLocale {
  return currentLocale.value;
}

export function setCurrentUiLocale(locale: UiLocale): void {
  currentLocale.value = locale;
  syncDocumentLanguage(locale);
}

export function initializeUiLocale(): void {
  if (typeof window === 'undefined') {
    setCurrentUiLocale(DEFAULT_UI_LOCALE);
    return;
  }

  const currentUrl = new URL(window.location.href);
  setCurrentUiLocale(resolveUiLocaleFromQuery(currentUrl.searchParams.get('lang')));
}

export function resolveUiLocaleFromQuery(value: unknown): UiLocale {
  return normalizeUiLocale(value);
}

export function getExplicitUiLocaleQuery(value: unknown): UiLocale | null {
  return parseUiLocale(value);
}

type LocaleQuery = Record<string, string>;

export function useUiI18n(): {
  locale: ComputedRef<UiLocale>;
  langQuery: ComputedRef<LocaleQuery>;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDateTime: (value?: string | null) => string;
  formatRelativeTime: (value?: string, now?: number) => string;
  withLocalePath: (path: string) => { path: string; query: LocaleQuery };
} {
  const route = useRoute();
  const locale = computed(() => currentLocale.value);
  const langQuery = computed<LocaleQuery>(() => {
    const explicitLocale = getExplicitUiLocaleQuery(route.query.lang);
    const query: LocaleQuery = {};
    if (explicitLocale) {
      query.lang = explicitLocale;
    }
    return query;
  });

  return {
    locale,
    langQuery,
    t(key, params) {
      return translateUiText(locale.value, key, params);
    },
    formatDateTime(value) {
      return formatUiDateTime(locale.value, value);
    },
    formatRelativeTime(value, now) {
      return formatUiRelativeTime(locale.value, value, now);
    },
    withLocalePath(path) {
      return {
        path,
        query: langQuery.value,
      };
    },
  };
}
