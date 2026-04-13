<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import { ApiRequestError, apiRequest } from './lib/api';
import skmLogoUrl from './assets/skm-logo.png';
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
const navDrawerOpen = ref(false);
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
const routeTitle = computed(() => t(String(route.meta.titleKey ?? 'nav.overview')));
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
  if (!launchCwd) {
    return t('common.unknown');
  }

  return shortenPath(launchCwd) || launchCwd;
});

const hasHeaderOperators = computed(() => quickActions.value.length > 0);
const showUnmatchedDirectory = computed(() => bootView.value !== null && !bootView.value.matchedProjectId);

function closeNavigationDrawer(): void {
  navDrawerOpen.value = false;
}

function toggleNavigationDrawer(): void {
  navDrawerOpen.value = !navDrawerOpen.value;
}

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

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeNavigationDrawer();
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
  window.addEventListener('keydown', handleWindowKeydown);
  await refreshBootContext();
  if (!launchStatus.value) {
    await refreshLaunchStatus();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown);
  document.body.style.overflow = '';
});

watch(
  () => route.fullPath,
  async () => {
    closeNavigationDrawer();
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
  () => navDrawerOpen.value,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
  },
  { immediate: true },
);

watch(
  () => [route.meta.titleKey, locale.value] as const,
  () => {
    document.documentElement.lang = locale.value;
    document.title = `${routeTitle.value} · skm`;
  },
  { immediate: true },
);
</script>

<template>
  <div class="app-bg min-h-screen">
    <button
      type="button"
      class="mobile-nav-trigger"
      :class="{ 'mobile-nav-trigger--drawer-open': navDrawerOpen }"
      :aria-expanded="navDrawerOpen"
      aria-controls="mobile-navigation-drawer"
      :aria-label="navDrawerOpen ? t('app.closeNavigation') : t('app.openNavigation')"
      @click="toggleNavigationDrawer"
    >
      <span class="mobile-nav-trigger__line" :class="{ 'mobile-nav-trigger__line--top-open': navDrawerOpen }" />
      <span class="mobile-nav-trigger__line" :class="{ 'mobile-nav-trigger__line--hidden': navDrawerOpen }" />
      <span class="mobile-nav-trigger__line" :class="{ 'mobile-nav-trigger__line--bottom-open': navDrawerOpen }" />
    </button>

    <div
      class="nav-drawer-overlay"
      :class="{ 'nav-drawer-overlay--open': navDrawerOpen }"
      :aria-hidden="!navDrawerOpen"
      @click="closeNavigationDrawer"
    />

    <aside
      id="mobile-navigation-drawer"
      class="workbench-shell nav-drawer"
      :class="{ 'nav-drawer--open': navDrawerOpen }"
      :aria-hidden="!navDrawerOpen"
    >
      <div class="space-y-6 nav-drawer__content" :class="{ 'nav-drawer__content--with-trigger': navDrawerOpen }">
        <div class="brand-lockup">
          <img class="brand-logo" :src="skmLogoUrl" alt="" aria-hidden="true" />
          <h1 class="brand-title">SKM</h1>
        </div>

        <nav class="space-y-2 text-sm">
          <RouterLink
            v-for="item in navigationItems"
            :key="`drawer-${item.to}`"
            :to="withLocalePath(item.to)"
            class="nav-link"
            :class="{ active: activeNavKey === item.navKey }"
            @click="closeNavigationDrawer"
          >
            {{ t(item.labelKey) }}
          </RouterLink>
        </nav>
      </div>
    </aside>

    <div class="app-layout">
      <aside class="workbench-shell nav-shell">
        <div class="space-y-6">
          <div class="brand-lockup">
            <img class="brand-logo" :src="skmLogoUrl" alt="" aria-hidden="true" />
            <h1 class="brand-title">SKM</h1>
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
        <section class="context-band" aria-label="Page context">
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
