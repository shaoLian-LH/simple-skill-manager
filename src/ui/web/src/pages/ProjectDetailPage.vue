<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import PageSearchBar from '../components/PageSearchBar.vue';
import PageStatePanel from '../components/PageStatePanel.vue';
import SkillToggleSwitch from '../components/SkillToggleSwitch.vue';
import SwitchButtonCard from '../components/SwitchButtonCard.vue';
import { apiRequest } from '../lib/api';
import { useSetQuickActions, useSetWorkspaceContext } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import { resolveRequestErrorMessage, usePendingSet } from '../lib/page';
import { sourceStateLabel } from '../../../text.js';
import type {
  ProjectDetailView,
  ProjectPresetControlView,
  ProjectSkillControlView,
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
        <section class="project-detail-section">
          <div class="project-detail-section__intro">
            <h3 class="section-heading">{{ t('projectDetail.presets') }}</h3>
            <p class="mt-2 text-sm leading-6 text-muted">{{ t('projectDetail.presetsDescription') }}</p>
          </div>

          <div class="panel">
            <div class="space-y-4">
              <div>
                <h4 class="subsection-heading">{{ t('common.enabled') }}</h4>
                <ul v-if="detail.presetControls.enabled.length > 0" class="control-card-grid control-card-grid--dense mt-3">
                  <li
                    v-for="row in detail.presetControls.enabled"
                    :key="`enabled-preset-${row.name}`"
                  >
                    <SwitchButtonCard :title="row.name" title-tag="h5" :muted="!row.editable">
                      <template #switch>
                        <SkillToggleSwitch
                          :checked="row.enabled"
                          :aria-label="`${row.name}: ${row.enabled ? t('common.disable') : t('common.enable')}`"
                          :disabled="isPresetBusy(row.name) || !row.editable"
                          :pending="isPresetBusy(row.name)"
                          @toggle="togglePreset(row)"
                        />
                      </template>

                      <template #body>
                        <p class="project-detail-card-copy text-sm leading-6 text-muted" :title="presetMeta(row)">
                          {{ presetMeta(row) }}
                        </p>
                      </template>
                    </SwitchButtonCard>
                  </li>
                </ul>
                <p v-else class="mt-2 text-sm text-muted">{{ t('projectDetail.noEnabledPresets') }}</p>
              </div>

              <div>
                <h4 class="subsection-heading">{{ t('common.available') }}</h4>
                <ul v-if="detail.presetControls.available.length > 0" class="control-card-grid control-card-grid--dense mt-3">
                  <li
                    v-for="row in detail.presetControls.available"
                    :key="`available-preset-${row.name}`"
                  >
                    <SwitchButtonCard :title="row.name" title-tag="h5" :muted="!row.editable">
                      <template #switch>
                        <SkillToggleSwitch
                          :checked="row.enabled"
                          :aria-label="`${row.name}: ${row.enabled ? t('common.disable') : t('common.enable')}`"
                          :disabled="isPresetBusy(row.name) || !row.editable"
                          :pending="isPresetBusy(row.name)"
                          @toggle="togglePreset(row)"
                        />
                      </template>

                      <template #body>
                        <p class="project-detail-card-copy text-sm leading-6 text-muted" :title="presetMeta(row)">
                          {{ presetMeta(row) }}
                        </p>
                      </template>
                    </SwitchButtonCard>
                  </li>
                </ul>
                <p v-else class="mt-2 text-sm text-muted">{{ t('projectDetail.allPresetsEnabled') }}</p>
              </div>
            </div>
          </div>
        </section>

        <section class="project-detail-section">
          <div class="project-detail-section__intro project-detail-section__intro--with-tools">
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
                :hide-label="true"
              />
            </div>
          </div>

          <div class="panel">
            <div class="space-y-4">
              <div>
                <h4 class="subsection-heading">{{ t('common.enabled') }}</h4>
                <ul v-if="filteredEnabledSkillRows.length > 0" class="control-card-grid mt-3">
                  <li
                    v-for="row in filteredEnabledSkillRows"
                    :key="`enabled-skill-${row.name}`"
                  >
                    <SwitchButtonCard :title="row.name" title-tag="h5" :muted="!row.editable">
                      <template v-if="!isPresetControlledSkill(row)" #switch>
                        <SkillToggleSwitch
                          :checked="row.direct"
                          :aria-label="`${row.name}: ${row.direct ? t('common.disable') : t('common.enable')}`"
                          :disabled="isSkillBusy(row.name) || !row.editable"
                          :pending="isSkillBusy(row.name)"
                          @toggle="toggleSkill(row)"
                        />
                      </template>

                      <template #body>
                        <div v-if="isPresetControlledSkill(row)" class="project-detail-card-stack">
                          <p
                            class="project-detail-card-copy project-detail-card-copy--roomy text-sm leading-6 text-muted"
                            :title="row.description || row.path"
                          >
                            {{ row.description || row.path }}
                          </p>
                          <button
                            type="button"
                            class="btn-secondary project-detail-card-button"
                            :disabled="isSkillBusy(row.name) || !row.editable"
                            @click="toggleSkill(row)"
                          >
                            {{ skillPresetSourceLabel(row) }}
                          </button>
                        </div>

                        <p
                          v-else
                          class="project-detail-card-copy project-detail-card-copy--roomy text-sm leading-6 text-muted"
                          :title="row.description || row.path"
                        >
                          {{ row.description || row.path }}
                        </p>
                      </template>
                    </SwitchButtonCard>
                  </li>
                </ul>
                <p v-else class="mt-2 text-sm text-muted">{{ t('projectDetail.noEnabledSkillMatch') }}</p>
              </div>

              <div>
                <h4 class="subsection-heading">{{ t('common.available') }}</h4>
                <ul v-if="filteredAvailableSkillRows.length > 0" class="control-card-grid mt-3">
                  <li
                    v-for="row in filteredAvailableSkillRows"
                    :key="`available-skill-${row.name}`"
                  >
                    <SwitchButtonCard :title="row.name" title-tag="h5" :muted="!row.editable">
                      <template v-if="!isPresetControlledSkill(row)" #switch>
                        <SkillToggleSwitch
                          :checked="row.direct"
                          :aria-label="`${row.name}: ${row.direct ? t('common.disable') : t('common.enable')}`"
                          :disabled="isSkillBusy(row.name) || !row.editable"
                          :pending="isSkillBusy(row.name)"
                          @toggle="toggleSkill(row)"
                        />
                      </template>

                      <template #body>
                        <div v-if="isPresetControlledSkill(row)" class="project-detail-card-stack">
                          <p
                            class="project-detail-card-copy project-detail-card-copy--roomy text-sm leading-6 text-muted"
                            :title="row.description || row.path"
                          >
                            {{ row.description || row.path }}
                          </p>
                          <button
                            type="button"
                            class="btn-secondary project-detail-card-button"
                            :disabled="isSkillBusy(row.name)"
                            @click="toggleSkill(row)"
                          >
                            {{ skillPresetSourceLabel(row) }}
                          </button>
                        </div>

                        <p
                          v-else
                          class="project-detail-card-copy project-detail-card-copy--roomy text-sm leading-6 text-muted"
                          :title="row.description || row.path"
                        >
                          {{ row.description || row.path }}
                        </p>
                      </template>
                    </SwitchButtonCard>
                  </li>
                </ul>
                <p v-else class="mt-2 text-sm text-muted">{{ t('projectDetail.noAvailableSkillMatch') }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.project-detail-layout {
  display: grid;
  gap: 1rem;
}

.project-detail-section {
  display: grid;
  gap: 0.75rem;
}

.project-detail-section__intro--with-tools {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.control-card-grid {
  display: grid;
  gap: 0.75rem;
}

.project-detail-card-copy {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.project-detail-card-copy--roomy {
  min-height: calc(1.5rem * 4);
}

.project-detail-card-stack {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  gap: 1.25rem;
}

.project-detail-card-button {
  width: 100%;
  min-height: 2.75rem;
}

@media (min-width: 640px) {
  .project-detail-section {
    gap: 1rem;
  }

  .control-card-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .control-card-grid--dense {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .project-detail-section__intro--with-tools {
    align-items: flex-end;
    flex-direction: row;
    justify-content: space-between;
  }

  .control-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .control-card-grid--dense {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 1536px) {
  .control-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .control-card-grid--dense {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
</style>
