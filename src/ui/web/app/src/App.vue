<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import { apiRequest, ApiRequestError } from './lib/api';
import { quickActionsKey, launchStatusKey } from './lib/chrome';
import { animateRouteSwap } from './lib/motion';
import type { BootView, LaunchStatusView, QuickActionView } from './types';

const route = useRoute();
const quickActions = ref<QuickActionView[]>([]);
const quickActionsOpen = ref(false);
const launchStatus = ref<LaunchStatusView | null>(null);
const stageRef = ref<HTMLElement | null>(null);
const toast = ref<string>('');

provide(quickActionsKey, (actions: QuickActionView[]) => {
  quickActions.value = actions;
});
provide(launchStatusKey, launchStatus);

const routeTitle = computed(() => {
  if (route.path.startsWith('/projects/')) return 'Project Detail';
  if (route.path === '/projects') return 'Projects';
  if (route.path === '/presets') return 'Presets';
  if (route.path === '/config') return 'Global Config';
  if (route.path === '/dashboard' || route.path === '/') return 'Dashboard';
  return 'Not Found';
});

const routeDescription = computed(() => {
  if (route.path.startsWith('/projects/')) {
    return 'Adjust direct skills and presets, then verify the resolved outcome panel.';
  }
  if (route.path === '/projects') {
    return 'Search and scan tracked projects, then jump directly into a detail workspace.';
  }
  if (route.path === '/presets') {
    return 'Maintain reusable preset bundles while keeping visibility on project impact.';
  }
  if (route.path === '/config') {
    return 'Tune global workspace defaults with focused form controls and inline validation.';
  }
  return 'Start work immediately with quick access to recent projects and contextual actions.';
});

function copyCommand(command: string): void {
  void navigator.clipboard
    .writeText(command)
    .then(() => {
      toast.value = `Copied: ${command}`;
      window.setTimeout(() => {
        toast.value = '';
      }, 1800);
    })
    .catch(() => undefined);
}

async function refreshLaunchStatus(): Promise<void> {
  try {
    launchStatus.value = await apiRequest<LaunchStatusView>('/api/launch-status');
  } catch (error) {
    if (error instanceof ApiRequestError) {
      toast.value = error.detail.message;
      return;
    }
    toast.value = 'Unable to load launch status.';
  }
}

onMounted(async () => {
  try {
    const boot = await apiRequest<BootView>('/api/boot');
    launchStatus.value = boot.launchStatus;
  } catch {
    await refreshLaunchStatus();
  }
});

watch(
  () => route.fullPath,
  async () => {
    quickActions.value = [];
    quickActionsOpen.value = false;
    await nextTick();
    if (stageRef.value) {
      animateRouteSwap(stageRef.value);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="app-bg min-h-screen p-4 md:p-6">
    <div class="mx-auto grid max-w-[1500px] gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside
        class="animate__animated animate__fadeInLeft workbench-shell flex flex-col justify-between rounded-[28px] border border-ink/10 bg-paper/90 p-4 shadow-workbench"
      >
        <div class="space-y-5">
          <div class="grid grid-cols-[58px_minmax(0,1fr)] gap-3">
            <div class="grid h-[58px] w-[58px] place-items-center rounded-2xl bg-copper text-xl font-display text-white">SKM</div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-copper">Warm Workbench</p>
              <h1 class="font-display text-xl text-ink">simple-skill-manager</h1>
              <p class="text-sm text-ink/70">Operate projects, presets, and config without losing context.</p>
            </div>
          </div>

          <nav class="space-y-2 text-sm">
            <RouterLink to="/dashboard" class="nav-link" :class="{ active: route.path === '/dashboard' || route.path === '/' }">Dashboard</RouterLink>
            <RouterLink to="/projects" class="nav-link" :class="{ active: route.path === '/projects' }">Projects</RouterLink>
            <RouterLink to="/presets" class="nav-link" :class="{ active: route.path === '/presets' }">Presets</RouterLink>
            <RouterLink to="/config" class="nav-link" :class="{ active: route.path === '/config' }">Global Config</RouterLink>
          </nav>
        </div>

        <section class="rounded-2xl border border-ink/10 bg-white/60 p-3 text-xs text-ink/80">
          <p class="font-semibold uppercase tracking-[0.16em] text-copper">Launch Status</p>
          <p class="mt-1 break-all">{{ launchStatus?.url ?? 'Loading...' }}</p>
          <p class="mt-1">
            Port:
            <span class="font-semibold text-ink">{{ launchStatus?.port ?? '-' }}</span>
            <span v-if="launchStatus?.usedPortFallback" class="ml-1 text-copper">(fallback)</span>
          </p>
        </section>
      </aside>

      <main ref="stageRef" class="animate__animated animate__fadeInUp workbench-shell rounded-[28px] border border-ink/10 bg-paper/90 p-4 shadow-workbench">
        <header class="flex items-start justify-between gap-4 border-b border-ink/10 pb-4">
          <div class="space-y-1">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-copper">Route Header</p>
            <h2 class="font-display text-3xl text-ink">{{ routeTitle }}</h2>
            <p class="max-w-3xl text-sm text-ink/70">{{ routeDescription }}</p>
          </div>
          <button type="button" class="btn-secondary" @click="quickActionsOpen = !quickActionsOpen">
            Quick Actions
          </button>
        </header>

        <section v-if="quickActionsOpen" class="mt-4 rounded-2xl border border-copper/25 bg-white/75 p-3">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-copper">Context Actions</p>
          <p class="mt-1 text-xs text-ink/70">These actions explain the equivalent CLI commands for the current page.</p>
          <ul class="mt-3 space-y-2">
            <li v-for="action in quickActions" :key="action.id" class="rounded-xl border border-ink/10 bg-paper/70 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-ink">{{ action.label }}</p>
                  <code class="mt-1 block text-xs text-ink/80">{{ action.command }}</code>
                </div>
                <button type="button" class="btn-ghost" @click="copyCommand(action.command)">Copy</button>
              </div>
            </li>
            <li v-if="quickActions.length === 0" class="rounded-xl border border-dashed border-ink/20 p-3 text-sm text-ink/65">
              No route-scoped quick actions are available yet.
            </li>
          </ul>
        </section>

        <div class="mt-4">
          <RouterView />
        </div>
      </main>
    </div>

    <div v-if="toast" class="fixed bottom-4 right-4 rounded-xl border border-copper/25 bg-white px-3 py-2 text-sm text-ink shadow-workbench">
      {{ toast }}
    </div>
  </div>
</template>
