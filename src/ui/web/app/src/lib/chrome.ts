import type { InjectionKey, Ref } from 'vue';
import { inject } from 'vue';

import type { LaunchStatusView, QuickActionView } from '../types';

export const quickActionsKey: InjectionKey<(actions: QuickActionView[]) => void> = Symbol('quick-actions');
export const launchStatusKey: InjectionKey<Ref<LaunchStatusView | null>> = Symbol('launch-status');

export function useSetQuickActions(): (actions: QuickActionView[]) => void {
  const setter = inject(quickActionsKey);
  return setter ?? (() => undefined);
}

export function useLaunchStatus(): Ref<LaunchStatusView | null> {
  const launchStatus = inject(launchStatusKey);
  if (!launchStatus) {
    throw new Error('Launch status provider is missing.');
  }
  return launchStatus;
}
