<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import PageSearchBar from '../components/PageSearchBar.vue';
import PageStatePanel from '../components/PageStatePanel.vue';
import { apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { asNumber, asRecord, asString, asStringArray } from '../lib/coerce';
import { getProjectLabel } from '../lib/format';
import { useUiI18n } from '../lib/i18n';
import { useLocalizedNavigation } from '../lib/navigation';
import { resolveRequestErrorMessage, usePendingSet } from '../lib/page';
import type { QuickOpenView } from '../types';

interface ProjectRowView {
  projectId: string;
  projectPath: string;
  targets: string[];
  enabledSkillCount: number;
  enabledPresetCount: number;
  updatedAt: string;
}

const setQuickActions = useSetQuickActions();
const { t, formatDateTime } = useUiI18n();
const { pushPath } = useLocalizedNavigation();

const loading = ref(true);
const errorMessage = ref('');
const hintMessage = ref('');
const searchQuery = ref('');
const rows = ref<ProjectRowView[]>([]);
const { isPending: isOpening, resetPending: resetOpening, setPending: setOpening } = usePendingSet();

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

useWorkspaceSpine(() => ({
  scopeLabel: t('nav.projects'),
  scopeDescription: errorMessage.value || t('projects.description'),
}));

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
  return getProjectLabel(projectPath);
}

async function loadProjects(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  hintMessage.value = '';
  resetOpening();
  setQuickActions([]);

  try {
    const payload = await apiRequest<unknown>('/api/projects');
    rows.value = normalizeProjectRows(payload);
  } catch (error) {
    errorMessage.value = resolveRequestErrorMessage(error, t('projects.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function quickOpenProject(projectId: string): Promise<void> {
  if (isOpening(projectId)) {
    return;
  }

  setOpening(projectId, true);
  hintMessage.value = '';

  try {
    const payload = await apiRequest<QuickOpenView>(`/api/projects/${encodeURIComponent(projectId)}/quick-open`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    hintMessage.value = payload.message;
  } catch (error) {
    hintMessage.value = resolveRequestErrorMessage(error, t('projects.openFailed'));
  } finally {
    setOpening(projectId, false);
  }
}

function openProjectDetail(projectId: string): void {
  void pushPath(`/projects/${encodeURIComponent(projectId)}`);
}

onMounted(() => {
  void loadProjects();
});
</script>

<template>
  <section class="space-y-4">
    <PageSearchBar
      id="project-search"
      v-model="searchQuery"
      :label="t('common.search')"
      :placeholder="t('projects.searchPlaceholder')"
    />

    <PageStatePanel v-if="loading">{{ t('projects.loading') }}</PageStatePanel>
    <PageStatePanel v-else-if="errorMessage" tone="error">{{ errorMessage }}</PageStatePanel>
    <PageStatePanel v-else-if="rows.length === 0">{{ t('projects.empty') }}</PageStatePanel>
    <PageStatePanel v-else-if="filteredRows.length === 0">{{ t('projects.noMatch') }}</PageStatePanel>
    <ul v-else class="overflow-hidden rounded-shell bg-canvas p-0 shadow-card divide-y divide-charcoal/10">
      <li v-for="row in filteredRows" :key="row.projectId" class="index-row">
        <button type="button" class="index-row-main" @click="openProjectDetail(row.projectId)">
          <div class="min-w-0">
            <p class="truncate font-semibold text-charcoal">{{ getProjectName(row.projectPath) }}</p>
            <p class="truncate text-sm text-muted" :title="row.projectPath">{{ row.projectPath }}</p>
            <p class="mt-2 text-xs leading-5 text-muted">
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

    <PageStatePanel v-if="hintMessage" tone="notice" tag="p">{{ hintMessage }}</PageStatePanel>
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
  border-radius: 0.75rem;
  padding: 0.5rem 0.625rem;
  transition: background-color 150ms ease;
}

.index-row-main:hover {
  background: rgba(36, 36, 36, 0.05);
}
</style>
