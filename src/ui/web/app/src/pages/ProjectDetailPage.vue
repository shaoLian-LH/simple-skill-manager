<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions, useSetWorkspaceContext } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import { sourceStateLabel } from '../../../../text.js';
import type {
  ProjectDetailView,
  ProjectPresetControlView,
  ProjectSkillControlView,
  ResolvedSkillView,
} from '../types';

const route = useRoute();
const setQuickActions = useSetQuickActions();
const setWorkspaceContext = useSetWorkspaceContext();
const { locale, t, formatDateTime } = useUiI18n();

const loading = ref(true);
const errorMessage = ref('');
const actionMessage = ref('');
const detail = ref<ProjectDetailView | null>(null);
const busyPresetNames = ref<Set<string>>(new Set());
const busySkillNames = ref<Set<string>>(new Set());
const skillSearch = ref('');

const projectId = computed(() => {
  const raw = route.params.projectId;
  return typeof raw === 'string' ? raw : '';
});

const filteredEnabledSkillRows = computed(() => {
  return filterSkillRows(detail.value?.skillControls.enabled ?? []);
});

const filteredAvailableSkillRows = computed(() => {
  return filterSkillRows(detail.value?.skillControls.available ?? []);
});

function matchesSkillSearch(row: ProjectSkillControlView): boolean {
  const query = skillSearch.value.trim().toLowerCase();
  if (query.length === 0) {
    return true;
  }

  const searchBlob = [
    row.name,
    row.description,
    row.path,
    row.viaPresets.join(' '),
    row.reason ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return searchBlob.includes(query);
}

function filterSkillRows(rows: ProjectSkillControlView[]): ProjectSkillControlView[] {
  return rows.filter((row) => matchesSkillSearch(row));
}

function setPresetBusy(name: string, nextValue: boolean): void {
  const next = new Set(busyPresetNames.value);
  if (nextValue) {
    next.add(name);
  } else {
    next.delete(name);
  }
  busyPresetNames.value = next;
}

function setSkillBusy(name: string, nextValue: boolean): void {
  const next = new Set(busySkillNames.value);
  if (nextValue) {
    next.add(name);
  } else {
    next.delete(name);
  }
  busySkillNames.value = next;
}

function isPresetBusy(name: string): boolean {
  return busyPresetNames.value.has(name);
}

function isSkillBusy(name: string): boolean {
  return busySkillNames.value.has(name);
}

function buildWorkspaceContext(current: ProjectDetailView): void {
  setWorkspaceContext({
    scopeLabel: current.displayName || t('common.scopeProject'),
    scopeDescription: t('projectDetail.targets', {
      targets: current.targets.length > 0 ? current.targets.join(', ') : t('projectDetail.noTargets'),
      updatedAt: formatDateTime(current.updatedAt),
    }),
    targets: current.targets,
  });
}

function presetMeta(row: ProjectPresetControlView): string {
  const base = sourceStateLabel(locale.value, row.source, row.readonly);
  return row.reason ? `${base} · ${row.reason}` : base;
}

function skillMeta(row: ProjectSkillControlView): string {
  if (row.reason) {
    return row.reason;
  }

  if (row.direct) {
    return t('facade.directLabel');
  }

  if (row.viaPresets.length > 0) {
    return t('facade.viaPresetLabel', { name: row.viaPresets.join(', ') });
  }

  return t('projectDetail.notEnabled');
}

function resolvedLabels(row: ResolvedSkillView): string[] {
  if (row.sources.length > 0) {
    return row.sources.map((source) => source.label);
  }

  if (row.direct) {
    return [t('facade.directLabel')];
  }

  if (row.viaPresets.length > 0) {
    return row.viaPresets.map((presetName) => t('facade.viaPresetLabel', { name: presetName }));
  }

  return [t('common.viaPreset')];
}

async function loadProjectDetail(): Promise<void> {
  const currentProjectId = projectId.value;
  if (!currentProjectId) {
    loading.value = false;
    errorMessage.value = t('projectDetail.missingId');
    setWorkspaceContext(null);
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  actionMessage.value = '';
  setQuickActions([]);

  try {
    const payload = await apiRequest<ProjectDetailView>(`/api/projects/${encodeURIComponent(currentProjectId)}`);
    detail.value = payload;
    buildWorkspaceContext(payload);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      errorMessage.value = error.detail.message;
    } else {
      errorMessage.value = t('projectDetail.loadFailed');
    }
    setWorkspaceContext(null);
  } finally {
    loading.value = false;
  }
}

async function togglePreset(row: ProjectPresetControlView): Promise<void> {
  if (!detail.value || !row.editable || isPresetBusy(row.name)) {
    return;
  }

  setPresetBusy(row.name, true);
  actionMessage.value = '';

  try {
    const endpoint = row.enabled ? 'off' : 'on';
    const payload = row.enabled
      ? { presetNames: [row.name] }
      : { presetNames: [row.name], targets: [] as string[] };

    const response = await apiRequest<ProjectDetailView>(
      `/api/projects/${encodeURIComponent(projectId.value)}/presets/${endpoint}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    detail.value = response;
    buildWorkspaceContext(response);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      actionMessage.value = error.detail.message;
    } else {
      actionMessage.value = t('projectDetail.updatePresetFailed', { name: row.name });
    }
  } finally {
    setPresetBusy(row.name, false);
  }
}

async function toggleSkill(row: ProjectSkillControlView): Promise<void> {
  if (!detail.value || !row.editable || isSkillBusy(row.name)) {
    return;
  }

  setSkillBusy(row.name, true);
  actionMessage.value = '';

  try {
    const endpoint = row.direct ? 'off' : 'on';
    const payload = row.direct
      ? { skillNames: [row.name] }
      : { skillNames: [row.name], targets: [] as string[] };

    const response = await apiRequest<ProjectDetailView>(
      `/api/projects/${encodeURIComponent(projectId.value)}/skills/${endpoint}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    detail.value = response;
    buildWorkspaceContext(response);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      actionMessage.value = error.detail.message;
    } else {
      actionMessage.value = t('projectDetail.updateSkillFailed', { name: row.name });
    }
  } finally {
    setSkillBusy(row.name, false);
  }
}

watchEffect(() => {
  if (loading.value || errorMessage.value || !detail.value) {
    setQuickActions([]);
    return;
  }

  setQuickActions([
    {
      id: 'project-detail-back',
      label: t('common.back'),
      command: 'history:back/projects',
      tone: 'ghost',
    },
    {
      id: 'project-detail-open',
      label: t('common.openProject'),
      loadingLabel: t('common.opening'),
      command: `project:open:${projectId.value}`,
      tone: 'secondary',
    },
  ]);
});

watch(
  () => projectId.value,
  () => {
    void loadProjectDetail();
  },
);

onMounted(() => {
  void loadProjectDetail();
});
</script>

<template>
  <section class="space-y-4">
    <section v-if="loading" class="panel text-sm text-ink/70">{{ t('projectDetail.loading') }}</section>
    <section v-else-if="errorMessage" class="panel border-red-200 bg-red-50 text-sm text-red-800">
      {{ errorMessage }}
    </section>
    <template v-else-if="detail">
      <p
        v-if="actionMessage"
        class="rounded-xl border border-copper/30 bg-copper/10 px-3 py-2 text-sm text-ink"
      >
        {{ actionMessage }}
      </p>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section class="panel">
          <p class="field-label">{{ t('projectDetail.presets') }}</p>
          <p class="mt-1 text-sm text-ink/70">{{ t('projectDetail.presetsDescription') }}</p>

          <div class="mt-4 space-y-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.11em] text-ink/70">{{ t('projectDetail.enabledSection') }}</p>
              <ul v-if="detail.presetControls.enabled.length > 0" class="mt-2 space-y-2">
                <li v-for="row in detail.presetControls.enabled" :key="`enabled-preset-${row.name}`" class="control-row">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-ink">{{ row.name }}</p>
                    <p class="mt-1 text-xs text-ink/70">{{ presetMeta(row) }}</p>
                  </div>
                  <button
                    type="button"
                    class="btn-secondary"
                    :disabled="isPresetBusy(row.name) || !row.editable"
                    @click="togglePreset(row)"
                  >
                    {{ row.editable ? (isPresetBusy(row.name) ? t('common.updating') : t('common.disable')) : t('common.readonly') }}
                  </button>
                </li>
              </ul>
              <p v-else class="mt-2 text-sm text-ink/70">{{ t('projectDetail.noEnabledPresets') }}</p>
            </div>

            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.11em] text-ink/70">{{ t('projectDetail.availableSection') }}</p>
              <ul v-if="detail.presetControls.available.length > 0" class="mt-2 space-y-2">
                <li v-for="row in detail.presetControls.available" :key="`available-preset-${row.name}`" class="control-row">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-ink">{{ row.name }}</p>
                    <p class="mt-1 text-xs text-ink/70">{{ presetMeta(row) }}</p>
                  </div>
                  <button
                    type="button"
                    class="btn-secondary"
                    :disabled="isPresetBusy(row.name) || !row.editable"
                    @click="togglePreset(row)"
                  >
                    {{ row.editable ? (isPresetBusy(row.name) ? t('common.updating') : t('common.enable')) : t('common.readonly') }}
                  </button>
                </li>
              </ul>
              <p v-else class="mt-2 text-sm text-ink/70">{{ t('projectDetail.allPresetsEnabled') }}</p>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="field-label">{{ t('projectDetail.skills') }}</p>
              <p class="mt-1 text-sm text-ink/70">{{ t('projectDetail.skillsDescription') }}</p>
            </div>
            <div class="w-full md:w-[280px]">
              <label class="field-label" for="project-skill-search">{{ t('common.search') }}</label>
              <input
                id="project-skill-search"
                v-model="skillSearch"
                class="text-input"
                type="search"
                :placeholder="t('projectDetail.searchPlaceholder')"
              />
            </div>
          </div>

          <div class="mt-4 space-y-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.11em] text-ink/70">{{ t('projectDetail.enabledSection') }}</p>
              <ul v-if="filteredEnabledSkillRows.length > 0" class="mt-2 space-y-2">
                <li v-for="row in filteredEnabledSkillRows" :key="`enabled-skill-${row.name}`" class="control-row">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-ink">{{ row.name }}</p>
                    <p class="mt-1 text-xs text-ink/70">{{ row.description || row.path }}</p>
                    <p class="mt-1 text-xs text-ink/60">{{ skillMeta(row) }}</p>
                  </div>
                  <button
                    type="button"
                    class="btn-secondary"
                    :disabled="isSkillBusy(row.name) || !row.editable"
                    @click="toggleSkill(row)"
                  >
                    {{
                      row.editable
                        ? isSkillBusy(row.name)
                          ? t('common.updating')
                          : t('common.disable')
                        : t('common.viaPreset')
                    }}
                  </button>
                </li>
              </ul>
              <p v-else class="mt-2 text-sm text-ink/70">{{ t('projectDetail.noEnabledSkillMatch') }}</p>
            </div>

            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.11em] text-ink/70">{{ t('projectDetail.availableSection') }}</p>
              <ul v-if="filteredAvailableSkillRows.length > 0" class="mt-2 space-y-2">
                <li v-for="row in filteredAvailableSkillRows" :key="`available-skill-${row.name}`" class="control-row">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-ink">{{ row.name }}</p>
                    <p class="mt-1 text-xs text-ink/70">{{ row.description || row.path }}</p>
                    <p class="mt-1 text-xs text-ink/60">{{ row.reason || t('projectDetail.notEnabled') }}</p>
                  </div>
                  <button
                    type="button"
                    class="btn-secondary"
                    :disabled="isSkillBusy(row.name)"
                    @click="toggleSkill(row)"
                  >
                    {{ isSkillBusy(row.name) ? t('common.updating') : t('common.enable') }}
                  </button>
                </li>
              </ul>
              <p v-else class="mt-2 text-sm text-ink/70">{{ t('projectDetail.noAvailableSkillMatch') }}</p>
            </div>
          </div>
        </section>
      </div>

      <aside class="panel">
        <p class="field-label">{{ t('projectDetail.resolvedOutcome') }}</p>
        <p class="mt-1 text-sm text-ink/70">{{ t('projectDetail.resolvedDescription') }}</p>

        <ul v-if="detail.resolvedSkills.length > 0" class="mt-4 space-y-2">
          <li v-for="row in detail.resolvedSkills" :key="`resolved-${row.name}`" class="resolved-row">
            <p class="font-semibold text-ink">{{ row.name }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="label in resolvedLabels(row)"
                :key="`${row.name}-${label}`"
                class="rounded-full border border-ink/20 bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink/80"
              >
                {{ label }}
              </span>
            </div>
          </li>
        </ul>
        <p v-else class="mt-4 text-sm text-ink/70">{{ t('projectDetail.noResolvedSkills') }}</p>
      </aside>
    </template>
  </section>
</template>

<style scoped>
.control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid rgba(45, 38, 31, 0.1);
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.66);
  padding: 0.75rem 0.85rem;
}

.resolved-row {
  border: 1px solid rgba(45, 38, 31, 0.1);
  border-radius: 0.9rem;
  background: rgba(247, 238, 227, 0.56);
  padding: 0.8rem 0.9rem;
}
</style>
