<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import { ApiRequestError, apiRequest } from './lib/api';
import { bootViewKey, launchStatusKey, quickActionsKey, workspaceSpineKey } from './lib/chrome';
import { useUiI18n } from './lib/i18n';
import { animateRouteSwap } from './lib/motion';
import type { BootView, LaunchStatusView, QuickActionView, WorkspaceSpineView } from './types';

const route = useRoute();
const { locale, t, withLocalePath } = useUiI18n();
const stageRef = ref<HTMLElement | null>(null);
const bootView = ref<BootView | null>(null);
const launchStatus = ref<LaunchStatusView | null>(null);
const workspaceSpine = ref<WorkspaceSpineView | null>(null);
const quickActions = ref<QuickActionView[]>([]);
const toast = ref('');

provide(bootViewKey, bootView);
provide(launchStatusKey, launchStatus);
provide(workspaceSpineKey, (value: WorkspaceSpineView | null) => {
  workspaceSpine.value = value;
});
provide(quickActionsKey, (actions: QuickActionView[]) => {
  quickActions.value = actions;
});

const navigationItems = [
  { labelKey: 'nav.overview', to: '/overview', navKey: 'overview' },
  { labelKey: 'nav.projects', to: '/projects', navKey: 'projects' },
  { labelKey: 'nav.skills', to: '/skills', navKey: 'skills' },
  { labelKey: 'nav.presets', to: '/presets', navKey: 'presets' },
  { labelKey: 'nav.config', to: '/config', navKey: 'config' },
] as const;

const activeNavKey = computed(() => String(route.meta.navKey ?? ''));
const routeTitle = computed(() => t(String(route.meta.titleKey ?? 'route.workbench')));
const routeDescription = computed(() => {
  switch (activeNavKey.value) {
    case 'overview':
      return t('app.routeDesc.overview');
    case 'projects':
      return route.path.startsWith('/projects/')
        ? t('app.routeDesc.projectDetail')
        : t('app.routeDesc.projects');
    case 'skills':
      return t('app.routeDesc.skills');
    case 'presets':
      return route.path.startsWith('/presets/')
        ? t('app.routeDesc.presetDetail')
        : t('app.routeDesc.presets');
    case 'config':
      return t('app.routeDesc.config');
    default:
      return t('app.routeDesc.fallback');
  }
});

const launchFolderName = computed(() => {
  const launchCwd = bootView.value?.launchCwd ?? '';
  if (!launchCwd) return t('common.unknown');
  const normalized = launchCwd.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? launchCwd;
});

const runtimeLine = computed(() => {
  if (!launchStatus.value) return t('app.checkingRuntime');
  return launchStatus.value.usedPortFallback
    ? t('app.runningRuntimeFallback', { port: launchStatus.value.port })
    : t('app.runningRuntime', { port: launchStatus.value.port });
});

function showToast(message: string): void {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) {
      toast.value = '';
    }
  }, 2200);
}

async function refreshBootContext(): Promise<void> {
  try {
    const boot = await apiRequest<BootView>('/api/boot');
    bootView.value = boot;
    launchStatus.value = boot.launchStatus;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      showToast(error.detail.message);
      return;
    }
    showToast(t('app.loadLaunchContextFailed'));
  }
}

async function refreshLaunchStatus(): Promise<void> {
  try {
    launchStatus.value = await apiRequest<LaunchStatusView>('/api/launch-status');
  } catch {
    launchStatus.value = null;
  }
}

async function openLaunchCwd(): Promise<void> {
  try {
    const result = await apiRequest<{ message: string }>('/api/launch-cwd/open', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    showToast(result.message);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      showToast(error.detail.message);
      return;
    }
    showToast(t('app.openLaunchFolderFailed'));
  }
}

onMounted(async () => {
  await refreshBootContext();
  if (!launchStatus.value) {
    await refreshLaunchStatus();
  }
});

watch(
  () => route.fullPath,
  async () => {
    quickActions.value = [];
    await nextTick();
    if (stageRef.value) {
      animateRouteSwap(stageRef.value);
    }
  },
  { immediate: true },
);

watch(
  () => [route.meta.titleKey, locale.value] as const,
  () => {
    document.documentElement.lang = locale.value;
    document.title = `${routeTitle.value} · simple-skill-manager`;
  },
  { immediate: true },
);
</script>

<template>
  <div class="app-bg min-h-screen p-4 md:p-6">
    <div class="mx-auto grid max-w-[1680px] gap-4 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
      <aside class="workbench-shell nav-shell">
        <div class="space-y-6">
          <div>
            <p class="brand-tag">{{ t('app.brandTag') }}</p>
            <h1 class="brand-title">simple-skill-manager</h1>
            <p class="brand-note">{{ t('app.brandNote') }}</p>
          </div>

          <nav class="space-y-2 text-sm">
            <RouterLink
              v-for="item in navigationItems"
              :key="item.to"
              :to="withLocalePath(item.to)"
              class="nav-link"
              :class="{ active: activeNavKey === item.navKey }"
            >
              {{ t(item.labelKey) }}
            </RouterLink>
          </nav>
        </div>
      </aside>

      <main ref="stageRef" class="workbench-shell workspace-shell">
        <header class="workspace-header">
          <p class="field-label">{{ t('app.workspace') }}</p>
          <h2 class="workspace-title">{{ routeTitle }}</h2>
          <p class="workspace-desc">{{ routeDescription }}</p>
        </header>
        <section class="workspace-body">
          <RouterView />
        </section>
      </main>

      <aside class="workbench-shell spine-shell">
        <header class="spine-header">
          <p class="field-label">{{ t('app.contextRuntime') }}</p>
          <h3 class="spine-title">{{ t('app.currentSession') }}</h3>
        </header>

        <section class="spine-group">
          <p class="spine-label">{{ t('app.launchCwd') }}</p>
          <p class="spine-value" :title="bootView?.launchCwd || t('common.unknownPath')">{{ launchFolderName }}</p>
          <div class="spine-row">
            <button v-if="bootView?.launchCwd" type="button" class="inline-link bg-transparent p-0" @click="openLaunchCwd">
              {{ t('common.openFolder') }}
            </button>
            <span v-else class="spine-hint">{{ t('app.folderPathUnavailable') }}</span>
          </div>
        </section>

        <section class="spine-group">
          <p class="spine-label">{{ t('app.projectMatch') }}</p>
          <div class="spine-row">
            <span class="status-pill" :class="bootView?.matchedProjectId ? 'status-pill-match' : 'status-pill-off'">
              {{ bootView?.matchedProjectId ? t('common.matchedProject') : t('common.noMatch') }}
            </span>
          </div>
          <p v-if="bootView?.matchedProjectName" class="spine-hint">{{ bootView.matchedProjectName }}</p>
        </section>

        <section class="spine-group">
          <p class="spine-label">{{ t('app.scopeTargets') }}</p>
          <p class="spine-value">{{ workspaceSpine?.scopeLabel ?? t('app.contextAwareWorkbench') }}</p>
          <p class="spine-hint">
            {{ workspaceSpine?.scopeDescription ?? t('app.routeDesc.fallback') }}
          </p>
          <p v-if="workspaceSpine?.targets?.length" class="spine-hint">
            {{ t('app.targets', { targets: workspaceSpine.targets.join(', ') }) }}
          </p>
        </section>

        <section class="spine-group">
          <p class="spine-label">{{ t('app.runtime') }}</p>
          <p class="spine-value">{{ runtimeLine }}</p>
          <p class="spine-hint">{{ launchStatus?.url ?? t('app.waitingRuntimeStatus') }}</p>
        </section>
      </aside>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
