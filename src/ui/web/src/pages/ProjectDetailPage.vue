<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import PageSearchBar from '../components/PageSearchBar.vue';
import PageStatePanel from '../components/PageStatePanel.vue';
import SkillToggleSwitch from '../components/SkillToggleSwitch.vue';
import { apiRequest } from '../lib/api';
import { useSetQuickActions, useSetWorkspaceContext } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import { resolveRequestErrorMessage, usePendingSet } from '../lib/page';
import { sourceStateLabel } from '../../../text.js';
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
const skillSearch = ref('');
const { isPending: isPresetBusy, setPending: setPresetBusy } = usePendingSet();
const { isPending: isSkillBusy, setPending: setSkillBusy } = usePendingSet();

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

function buildWorkspaceContext(current: ProjectDetailView): void {
  setWorkspaceContext({
    scopeLabel: current.displayName || t('common.scopeProject'),
    scopeDescription: t('projectDetail.targets', {
      targets: current.targets.length > 0 ? current.targets.join(', ') : t('common.none'),
      updatedAt: formatDateTime(current.updatedAt),
    }),
    targets: current.targets,
  });
}

function presetMeta(row: ProjectPresetControlView): string {
  const base = sourceStateLabel(locale.value, row.source, row.readonly);
  return row.reason ? `${base} · ${row.reason}` : base;
}

function isPresetControlledSkill(row: ProjectSkillControlView): boolean {
  return !row.direct && row.viaPresets.length > 0;
}

function skillPresetSourceLabel(row: ProjectSkillControlView): string {
  if (row.viaPresets.length === 0) {
    return '';
  }

  return t('projectDetail.fromPreset', { names: row.viaPresets.join(', ') });
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
    errorMessage.value = resolveRequestErrorMessage(error, t('projectDetail.loadFailed'));
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
    actionMessage.value = resolveRequestErrorMessage(error, t('projectDetail.updatePresetFailed', { name: row.name }));
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
    actionMessage.value = resolveRequestErrorMessage(error, t('projectDetail.updateSkillFailed', { name: row.name }));
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
    <PageStatePanel v-if="loading">{{ t('projectDetail.loading') }}</PageStatePanel>
    <PageStatePanel v-else-if="errorMessage" tone="error">{{ errorMessage }}</PageStatePanel>
    <template v-else-if="detail">
      <PageStatePanel v-if="actionMessage" tone="notice" tag="p">{{ actionMessage }}</PageStatePanel>

      <div class="project-detail-layout">
        <section class="panel">
          <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 class="section-heading">{{ t('projectDetail.skills') }}</h3>
              <p class="mt-2 text-sm leading-6 text-muted">{{ t('projectDetail.skillsDescription') }}</p>
            </div>
            <div class="w-full md:w-[280px]">
              <PageSearchBar
                id="project-skill-search"
                v-model="skillSearch"
                :label="t('common.search')"
                :placeholder="t('projectDetail.searchPlaceholder')"
              />
            </div>
          </div>

          <div class="mt-4 space-y-4">
            <div>
              <h4 class="subsection-heading">{{ t('common.enabled') }}</h4>
              <ul v-if="filteredEnabledSkillRows.length > 0" class="skill-control-grid mt-3">
                <li
                  v-for="row in filteredEnabledSkillRows"
                  :key="`enabled-skill-${row.name}`"
                  class="skill-control-card"
                  :class="{
                    'skill-control-card--muted': !row.editable
                  }"
                >
                  <SkillToggleSwitch
                    v-if="!isPresetControlledSkill(row)"
                    class="skill-switch"
                    :checked="row.direct"
                    :aria-label="`${row.name}: ${row.direct ? t('common.disable') : t('common.enable')}`"
                    :disabled="isSkillBusy(row.name) || !row.editable"
                    :pending="isSkillBusy(row.name)"
                    @toggle="toggleSkill(row)"
                  />
                  <div class="skill-control-card__body">
                    <div class="skill-control-card__header min-w-0">
                      <h5 class="skill-control-card__title font-display text-2xl text-charcoal" :title="row.name">{{ row.name }}</h5>
                    </div>
                    <p
                      class="skill-control-card__description mt-3 text-sm leading-6 text-muted"
                      :title="row.description || row.path"
                    >
                      {{ row.description || row.path }}
                    </p>
                  </div>
                  <button
                    v-if="isPresetControlledSkill(row)"
                    type="button"
                    class="btn-secondary skill-control-card__button"
                    :disabled="isSkillBusy(row.name) || !row.editable"
                    @click="toggleSkill(row)"
                  >
                    {{ skillPresetSourceLabel(row) }}
                  </button>
                </li>
              </ul>
              <p v-else class="mt-2 text-sm text-muted">{{ t('projectDetail.noEnabledSkillMatch') }}</p>
            </div>

            <div>
              <h4 class="subsection-heading">{{ t('common.available') }}</h4>
              <ul v-if="filteredAvailableSkillRows.length > 0" class="skill-control-grid mt-3">
                <li
                  v-for="row in filteredAvailableSkillRows"
                  :key="`available-skill-${row.name}`"
                  class="skill-control-card"
                  :class="{
                    'skill-control-card--muted': !row.editable
                  }"
                >
                  <SkillToggleSwitch
                    v-if="!isPresetControlledSkill(row)"
                    class="skill-switch"
                    :checked="row.direct"
                    :aria-label="`${row.name}: ${row.direct ? t('common.disable') : t('common.enable')}`"
                    :disabled="isSkillBusy(row.name) || !row.editable"
                    :pending="isSkillBusy(row.name)"
                    @toggle="toggleSkill(row)"
                  />
                  <div class="skill-control-card__body">
                    <div class="skill-control-card__header min-w-0">
                      <h5 class="skill-control-card__title font-display text-2xl text-charcoal" :title="row.name">{{ row.name }}</h5>
                    </div>
                    <p
                      class="skill-control-card__description mt-3 text-sm leading-6 text-muted"
                      :title="row.description || row.path"
                    >
                      {{ row.description || row.path }}
                    </p>
                  </div>
                  <button
                    v-if="isPresetControlledSkill(row)"
                    type="button"
                    class="btn-secondary skill-control-card__button"
                    :disabled="isSkillBusy(row.name)"
                    @click="toggleSkill(row)"
                  >
                    {{ skillPresetSourceLabel(row) }}
                  </button>
                </li>
              </ul>
              <p v-else class="mt-2 text-sm text-muted">{{ t('projectDetail.noAvailableSkillMatch') }}</p>
            </div>
          </div>
        </section>

        <aside class="panel">
          <h3 class="section-heading">{{ t('projectDetail.presets') }}</h3>
          <p class="mt-2 text-sm leading-6 text-muted">{{ t('projectDetail.presetsDescription') }}</p>

          <div class="mt-4 space-y-4">
            <div>
              <h4 class="subsection-heading">{{ t('common.enabled') }}</h4>
              <ul v-if="detail.presetControls.enabled.length > 0" class="mt-2 space-y-2">
                <li v-for="row in detail.presetControls.enabled" :key="`enabled-preset-${row.name}`" class="preset-control-row">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-charcoal">{{ row.name }}</p>
                    <p class="mt-2 text-xs leading-5 text-muted">{{ presetMeta(row) }}</p>
                  </div>
                  <button
                    type="button"
                    class="btn-secondary preset-control-row__button"
                    :disabled="isPresetBusy(row.name) || !row.editable"
                    @click="togglePreset(row)"
                  >
                    {{ row.editable ? (isPresetBusy(row.name) ? t('common.updating') : t('common.disable')) : t('common.readonly') }}
                  </button>
                </li>
              </ul>
              <p v-else class="mt-2 text-sm text-muted">{{ t('projectDetail.noEnabledPresets') }}</p>
            </div>

            <div>
              <h4 class="subsection-heading">{{ t('common.available') }}</h4>
              <ul v-if="detail.presetControls.available.length > 0" class="mt-2 space-y-2">
                <li v-for="row in detail.presetControls.available" :key="`available-preset-${row.name}`" class="preset-control-row">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-charcoal">{{ row.name }}</p>
                    <p class="mt-2 text-xs leading-5 text-muted">{{ presetMeta(row) }}</p>
                  </div>
                  <button
                    type="button"
                    class="btn-secondary preset-control-row__button"
                    :disabled="isPresetBusy(row.name) || !row.editable"
                    @click="togglePreset(row)"
                  >
                    {{ row.editable ? (isPresetBusy(row.name) ? t('common.updating') : t('common.enable')) : t('common.readonly') }}
                  </button>
                </li>
              </ul>
              <p v-else class="mt-2 text-sm text-muted">{{ t('projectDetail.allPresetsEnabled') }}</p>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.project-detail-layout {
  display: grid;
  gap: 1rem;
}

.preset-control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  border: 0;
  border-radius: 0.75rem;
  background: #f5f5f5;
  padding: 0.9rem 1rem;
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px;
}

.preset-control-row__button {
  white-space: nowrap;
}

.skill-control-grid {
  display: grid;
  gap: 0.75rem;
}

.skill-control-card {
  position: relative;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: space-between;
  gap: 1.25rem;
  border-radius: 1rem;
  background: #ffffff;
  padding: 1.5rem;
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px;
}

.skill-control-card--muted {
  background: #f5f5f5;
}

.skill-control-card__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.skill-control-card__header {
  min-width: 0;
}

.skill-control-card__title {
  display: -webkit-box;
  min-width: 0;
  max-width: calc(100% - 4rem);
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.12;
}

.skill-control-card__description {
  display: -webkit-box;
  min-height: calc(1.5rem * 4);
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skill-control-card__button {
  width: 100%;
  min-height: 2.75rem;
}

.skill-switch {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1;
}

.resolved-row {
  border-radius: 0.75rem;
  background: #f5f5f5;
  padding: 1rem;
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px;
}

@media (min-width: 640px) {
  .skill-control-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .skill-control-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .project-detail-layout {
    grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
    align-items: start;
  }
}

@media (min-width: 1536px) {
  .skill-control-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1439px) {
  .preset-control-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .preset-control-row__button {
    width: 100%;
    margin-top: 0.25rem;
  }
}
</style>
