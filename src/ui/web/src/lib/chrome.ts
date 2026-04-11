import type { InjectionKey, Ref } from 'vue';
import { inject, onBeforeUnmount, watchEffect } from 'vue';

import type { BootView, LaunchStatusView, QuickActionView, WorkspaceSpineView } from '../types';

export const quickActionsKey: InjectionKey<(actions: QuickActionView[]) => void> = Symbol('quick-actions');
export const launchStatusKey: InjectionKey<Ref<LaunchStatusView | null>> = Symbol('launch-status');
export const bootViewKey: InjectionKey<Ref<BootView | null>> = Symbol('boot-view');
export const workspaceSpineKey: InjectionKey<(value: WorkspaceSpineView | null) => void> = Symbol('workspace-spine');

export const bootStateKey = bootViewKey;
export const workspaceContextKey: InjectionKey<Ref<WorkspaceSpineView | null>> = Symbol('workspace-context');
export const setWorkspaceContextKey: InjectionKey<(value: WorkspaceSpineView | null) => void> = Symbol('set-workspace-context');
export const workbenchSpineKey = workspaceSpineKey;

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

export function useBootView(): Ref<BootView | null> {
  const bootView = inject(bootViewKey);
  if (!bootView) {
    throw new Error('Boot view provider is missing.');
  }
  return bootView;
}

export function useSetWorkspaceContext(): (value: WorkspaceSpineView | null) => void {
  const setter = inject(setWorkspaceContextKey) ?? inject(workspaceSpineKey);
  return setter ?? (() => undefined);
}

export function useWorkspaceSpine(valueFactory: () => WorkspaceSpineView | null): void {
  const setter = useSetWorkspaceContext();

  watchEffect(() => {
    setter(valueFactory());
  });

  onBeforeUnmount(() => {
    setter(null);
  });
}
