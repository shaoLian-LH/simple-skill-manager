import { ref } from 'vue';

import { ApiRequestError } from './api';

export function resolveRequestErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof ApiRequestError ? error.detail.message : fallbackMessage;
}

export function usePendingSet(): {
  isPending: (key: string) => boolean;
  setPending: (key: string, nextValue: boolean) => void;
  resetPending: () => void;
} {
  const pendingKeys = ref<Set<string>>(new Set());

  function isPending(key: string): boolean {
    return pendingKeys.value.has(key);
  }

  function setPending(key: string, nextValue: boolean): void {
    const next = new Set(pendingKeys.value);
    if (nextValue) {
      next.add(key);
    } else {
      next.delete(key);
    }
    pendingKeys.value = next;
  }

  function resetPending(): void {
    pendingKeys.value = new Set();
  }

  return {
    isPending,
    setPending,
    resetPending,
  };
}
