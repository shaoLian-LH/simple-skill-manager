<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import { ApiRequestError, apiRequest } from './lib/api';
import { bootViewKey, launchStatusKey, quickActionsKey, workspaceSpineKey } from './lib/chrome';
import { useUiI18n } from './lib/i18n';
import { animateRouteSwap } from './lib/motion';
import type { BootView, LaunchStatusView, QuickActionView, WorkspaceSpineView } from './types';

const route = useRoute();
const router = useRouter();
const { locale, t, withLocalePath } = useUiI18n();
const stageRef = ref<HTMLElement | null>(null);
const bootView = ref<BootView | null>(null);
const launchStatus = ref<LaunchStatusView | null>(null);
const workspaceSpine = ref<WorkspaceSpineView | null>(null);
const quickActions = ref<QuickActionView[]>([]);
const pendingQuickActionIds = ref<Set<string>>(new Set());
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

function shortenPath(input: string): string {
  if (!input) {
    return '';
  }

  const normalized = input.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 2) {
    return normalized || input;
  }
  return `${segments.at(-2)}/${segments.at(-1)}`;
}

const shortLaunchPath = computed(() => {
  const launchCwd = bootView.value?.launchCwd ?? '';
  if (!launchCwd) return t('common.unknown');
  return shortenPath(launchCwd) || launchCwd;
});

const hasHeaderOperators = computed(() => quickActions.value.length > 0);
const showUnmatchedDirectory = computed(() => bootView.value !== null && !bootView.value.matchedProjectId);

function setQuickActionPending(actionId: string, nextValue: boolean): void {
  const next = new Set(pendingQuickActionIds.value);
  if (nextValue) {
    next.add(actionId);
  } else {
    next.delete(actionId);
  }
  pendingQuickActionIds.value = next;
}

function isQuickActionPending(actionId: string): boolean {
  return pendingQuickActionIds.value.has(actionId);
}

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

async function runQuickAction(action: QuickActionView): Promise<void> {
  if (isQuickActionPending(action.id)) {
    return;
  }

  setQuickActionPending(action.id, true);

  try {
    if (action.command.startsWith('history:back')) {
      const fallbackPath = action.command.slice('history:back'.length) || '/projects';
      if (window.history.length > 1) {
        await router.back();
      } else {
        await router.push(withLocalePath(fallbackPath));
      }
      return;
    }

    if (action.command.startsWith('project:open:')) {
      const projectId = action.command.slice('project:open:'.length);
      if (!projectId) {
        return;
      }
      const payload = await apiRequest<{ message: string }>(`/api/projects/${encodeURIComponent(projectId)}/quick-open`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      showToast(payload.message);
      return;
    }

    if (action.command.startsWith('/')) {
      await router.push(withLocalePath(action.command));
    }
  } catch (error) {
    if (error instanceof ApiRequestError) {
      showToast(error.detail.message);
      return;
    }
    showToast(t('projectDetail.openFailed'));
  } finally {
    setQuickActionPending(action.id, false);
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
    pendingQuickActionIds.value = new Set();
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
  <div class="app-bg min-h-screen">
    <div class="app-layout">
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

      <div class="workspace-stage">
        <section class="context-band" aria-label="Workspace context">
          <div class="context-meta-item">
            <p v-if="showUnmatchedDirectory" class="context-meta-note">
              {{ t('app.unmatchedLaunchDirectory') }}
            </p>
            <a
              v-if="bootView?.launchCwd"
              href="/api/launch-cwd/open"
              class="path-link"
              :title="bootView.launchCwd"
            >
              {{ shortLaunchPath }}
            </a>
            <p v-else class="context-meta-value" :title="t('common.unknownPath')">
              {{ t('common.unknownPath') }}
            </p>
          </div>
        </section>

        <main ref="stageRef" class="workbench-shell workspace-shell">
          <header class="workspace-header" :class="{ 'workspace-header--detail': hasHeaderOperators }">
            <div class="workspace-header-main">
              <p class="field-label">{{ t('app.workspace') }}</p>
              <h2 class="workspace-title">{{ routeTitle }}</h2>
              <p class="workspace-desc">{{ routeDescription }}</p>
            </div>

            <div v-if="hasHeaderOperators" class="workspace-operators">
              <button
                v-for="action in quickActions"
                :key="action.id"
                type="button"
                class="workspace-operator"
                :class="{
                  'btn-primary': action.tone === 'primary',
                  'btn-ghost': action.tone === 'ghost',
                  'btn-secondary': !action.tone || action.tone === 'secondary',
                }"
                :disabled="isQuickActionPending(action.id)"
                @click="runQuickAction(action)"
              >
                {{ isQuickActionPending(action.id) ? action.loadingLabel ?? action.label : action.label }}
              </button>
            </div>
          </header>
          <section class="workspace-body">
            <RouterView />
          </section>
        </main>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
