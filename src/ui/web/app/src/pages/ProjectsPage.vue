<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import type { QuickOpenView } from '../types';

interface ProjectRowView {
  projectId: string;
  projectPath: string;
  targets: string[];
  enabledSkillCount: number;
  enabledPresetCount: number;
  updatedAt: string;
}

const router = useRouter();
const setQuickActions = useSetQuickActions();
const { t, formatDateTime, withLocalePath } = useUiI18n();

const loading = ref(true);
const errorMessage = ref('');
const hintMessage = ref('');
const searchQuery = ref('');
const rows = ref<ProjectRowView[]>([]);
const openingProjectIds = ref<Set<string>>(new Set());

const filteredRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (query.length === 0) {
    return rows.value;
  }

  return rows.value.filter((row) => {
    const blob = [row.projectId, row.projectPath, row.targets.join(' '), getProjectName(row.projectPath)].join(' ').toLowerCase();
    return blob.includes(query);
  });
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeProjectRows(payload: unknown): ProjectRowView[] {
  const input = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload)?.items)
      ? ((asRecord(payload)?.items ?? []) as unknown[])
      : [];

  return input
    .map((entry) => {
      const record = asRecord(entry) ?? {};
      return {
        projectId: asString(record.projectId),
        projectPath: asString(record.projectPath),
        targets: asStringArray(record.targets),
        enabledSkillCount: asNumber(record.enabledSkillCount),
        enabledPresetCount: asNumber(record.enabledPresetCount),
        updatedAt: asString(record.updatedAt),
      };
    })
    .filter((row) => row.projectId.length > 0 && row.projectPath.length > 0)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function getProjectName(projectPath: string): string {
  const segments = projectPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.at(-1) ?? projectPath;
}

function isOpening(projectId: string): boolean {
  return openingProjectIds.value.has(projectId);
}

function pushOpening(projectId: string): void {
  const next = new Set(openingProjectIds.value);
  next.add(projectId);
  openingProjectIds.value = next;
}

function popOpening(projectId: string): void {
  const next = new Set(openingProjectIds.value);
  next.delete(projectId);
  openingProjectIds.value = next;
}

async function loadProjects(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  hintMessage.value = '';
  setQuickActions([]);

  try {
    const payload = await apiRequest<unknown>('/api/projects');
    rows.value = normalizeProjectRows(payload);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      errorMessage.value = error.detail.message;
    } else {
      errorMessage.value = t('projects.loadFailed');
    }
  } finally {
    loading.value = false;
  }
}

async function quickOpenProject(projectId: string): Promise<void> {
  if (isOpening(projectId)) {
    return;
  }

  pushOpening(projectId);
  hintMessage.value = '';

  try {
    const payload = await apiRequest<QuickOpenView>(`/api/projects/${encodeURIComponent(projectId)}/quick-open`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    hintMessage.value = payload.message;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      hintMessage.value = error.detail.message;
    } else {
      hintMessage.value = t('projects.openFailed');
    }
  } finally {
    popOpening(projectId);
  }
}

function openProjectDetail(projectId: string): void {
  void router.push(withLocalePath(`/projects/${encodeURIComponent(projectId)}`));
}

onMounted(() => {
  void loadProjects();
});
</script>

<template>
  <section class="space-y-4">
    <header class="panel">
      <p class="field-label">{{ t('projects.workspaceLabel') }}</p>
      <div class="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 class="font-display text-2xl text-ink">{{ t('projects.title') }}</h3>
          <p class="mt-1 text-sm text-ink/70">{{ t('projects.description') }}</p>
        </div>
        <p class="text-sm text-ink/70">
          {{ t('projects.showingCount', { shown: filteredRows.length, total: rows.length }) }}
        </p>
      </div>

      <div class="mt-4">
        <label class="field-label" for="project-search">{{ t('common.search') }}</label>
        <input
          id="project-search"
          v-model="searchQuery"
          class="text-input"
          type="search"
          :placeholder="t('projects.searchPlaceholder')"
        />
      </div>
    </header>

    <section v-if="loading" class="panel text-sm text-ink/70">{{ t('projects.loading') }}</section>
    <section v-else-if="errorMessage" class="panel border-red-200 bg-red-50 text-sm text-red-800">
      {{ errorMessage }}
    </section>
    <section v-else-if="rows.length === 0" class="panel text-sm text-ink/70">
      {{ t('projects.empty') }}
    </section>
    <section v-else-if="filteredRows.length === 0" class="panel text-sm text-ink/70">
      {{ t('projects.noMatch') }}
    </section>
    <ul v-else class="panel divide-y divide-ink/10 p-0">
      <li v-for="row in filteredRows" :key="row.projectId" class="index-row">
        <button type="button" class="index-row-main" @click="openProjectDetail(row.projectId)">
          <div class="min-w-0">
            <p class="truncate font-semibold text-ink">{{ getProjectName(row.projectPath) }}</p>
            <p class="truncate text-sm text-ink/70" :title="row.projectPath">{{ row.projectPath }}</p>
            <p class="mt-1 text-xs text-ink/70">
              {{
                row.targets.length > 0 ? row.targets.join(', ') : t('projects.noTargets')
              }}
              ·
              {{
                t('projects.skillPresetSummary', {
                  skillCount: row.enabledSkillCount,
                  presetCount: row.enabledPresetCount,
                })
              }}
              ·
              {{ t('projects.updatedAt', { value: formatDateTime(row.updatedAt) }) }}
            </p>
          </div>
        </button>

        <button
          type="button"
          class="btn-secondary"
          :disabled="isOpening(row.projectId)"
          @click.stop="quickOpenProject(row.projectId)"
        >
          {{ isOpening(row.projectId) ? t('common.opening') : t('common.openProject') }}
        </button>
      </li>
    </ul>

    <p v-if="hintMessage" class="rounded-xl border border-copper/30 bg-copper/10 px-3 py-2 text-sm text-ink">
      {{ hintMessage }}
    </p>
  </section>
</template>

<style scoped>
.index-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 1rem;
}

.index-row-main {
  min-width: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 0.85rem;
  padding: 0.35rem 0.4rem;
  transition: background-color 150ms ease;
}

.index-row-main:hover {
  background: rgba(186, 106, 63, 0.1);
}
</style>
