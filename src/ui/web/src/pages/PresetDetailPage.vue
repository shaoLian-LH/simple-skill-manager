<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import PageSearchBar from '../components/PageSearchBar.vue';
import PageStatePanel from '../components/PageStatePanel.vue';
import { apiRequest } from '../lib/api';
import { useSetQuickActions, useSetWorkspaceContext } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import { useLocalizedNavigation } from '../lib/navigation';
import { resolveRequestErrorMessage } from '../lib/page';
import { buildPresetDeleteConfirmationMessage } from '../lib/preset';
import { sourceStateLabel } from '../../../text.js';
import type {
  PresetDeletePreviewView,
  PresetDeleteView,
  PresetDetailView,
  PresetSkillMembershipView,
} from '../types';

const route = useRoute();
const setQuickActions = useSetQuickActions();
const setWorkspaceContext = useSetWorkspaceContext();
const { locale, t } = useUiI18n();
const { pushPath, replacePath } = useLocalizedNavigation();

const loading = ref(true);
const actionBusy = ref(false);
const deleting = ref(false);
const errorMessage = ref('');
const actionMessage = ref('');
const searchQuery = ref('');
const detail = ref<PresetDetailView | null>(null);
const deletePreview = ref<PresetDeletePreviewView | null>(null);

const presetName = computed(() => {
  const raw = route.params.presetName;
  return typeof raw === 'string' ? raw : '';
});

const filteredSkillRows = computed(() => {
  const current = detail.value;
  if (!current) {
    return [] as PresetSkillMembershipView[];
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query.length === 0) {
    return current.availableSkills;
  }

  return current.availableSkills.filter((skill) => {
    return (
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.path.toLowerCase().includes(query)
    );
  });
});

function buildWorkspaceContext(current: PresetDetailView): void {
  setWorkspaceContext({
    scopeLabel: current.name,
    scopeDescription: t('presetDetail.scopeDescription', {
      name: current.name,
      status: sourceStateLabel(locale.value, current.source, current.readonly),
      skillCount: current.skillCount,
      projectCount: current.referenceCount,
    }),
  });
}

async function loadPresetDetail(): Promise<void> {
  const name = presetName.value;
  if (!name) {
    loading.value = false;
    errorMessage.value = t('presetDetail.missingName');
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  actionMessage.value = '';
  setQuickActions([]);

  try {
    const [detailPayload, previewPayload] = await Promise.all([
      apiRequest<PresetDetailView>(`/api/presets/${encodeURIComponent(name)}`),
      apiRequest<PresetDeletePreviewView>(`/api/presets/${encodeURIComponent(name)}/rm-preview`),
    ]);

    detail.value = detailPayload;
    deletePreview.value = previewPayload;
    buildWorkspaceContext(detailPayload);
  } catch (error) {
    errorMessage.value = resolveRequestErrorMessage(error, t('presetDetail.loadFailed'));
    setWorkspaceContext({
      scopeLabel: t('presetDetail.scopeLabel'),
      scopeDescription: t('presetDetail.scopeErrorDescription'),
    });
  } finally {
    loading.value = false;
  }
}

async function toggleSkill(skill: PresetSkillMembershipView): Promise<void> {
  const current = detail.value;
  if (!current || !skill.editable || actionBusy.value) {
    return;
  }

  actionBusy.value = true;
  actionMessage.value = '';

  try {
    const nextSkills = new Set(current.includedSkills);
    if (nextSkills.has(skill.name)) {
      nextSkills.delete(skill.name);
    } else {
      nextSkills.add(skill.name);
    }

    await apiRequest(`/api/presets/${encodeURIComponent(current.name)}`, {
      method: 'PUT',
      body: JSON.stringify({
        skills: [...nextSkills].sort((left, right) => left.localeCompare(right)),
      }),
    });

    await loadPresetDetail();
  } catch (error) {
    actionMessage.value = resolveRequestErrorMessage(error, t('presetDetail.updateFailed', { name: skill.name }));
  } finally {
    actionBusy.value = false;
  }
}

async function deletePreset(): Promise<void> {
  const current = detail.value;
  if (!current || deleting.value) {
    return;
  }

  deleting.value = true;
  actionMessage.value = '';

  try {
    const preview = await apiRequest<PresetDeletePreviewView>(`/api/presets/${encodeURIComponent(current.name)}/rm-preview`);
    deletePreview.value = preview;

    if (preview.readonly) {
      actionMessage.value = t('presetDetail.readonlyDeleteBlocked', { name: preview.name });
      return;
    }

    if (!window.confirm(buildPresetDeleteConfirmationMessage(preview, locale.value))) {
      return;
    }

    const result = await apiRequest<PresetDeleteView>(`/api/presets/${encodeURIComponent(current.name)}`, {
      method: 'DELETE',
    });
    actionMessage.value = t('presetDetail.deleted', { name: result.deleted.name });
    await replacePath('/presets');
  } catch (error) {
    actionMessage.value = resolveRequestErrorMessage(error, t('presetDetail.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}

function openProjectDetail(projectId: string): void {
  void pushPath(`/projects/${encodeURIComponent(projectId)}`);
}

watchEffect(() => {
  if (loading.value || errorMessage.value || !detail.value) {
    setQuickActions([]);
    return;
  }

  setQuickActions([
    {
      id: 'preset-detail-back',
      label: t('common.back'),
      command: 'history:back/presets',
      tone: 'ghost',
    },
  ]);
});

watch(
  () => presetName.value,
  () => {
    void loadPresetDetail();
  },
);

onMounted(() => {
  void loadPresetDetail();
});
</script>

<template>
  <section class="space-y-4">
    <PageStatePanel v-if="loading">{{ t('presetDetail.loading') }}</PageStatePanel>
    <PageStatePanel v-else-if="errorMessage" tone="error">{{ errorMessage }}</PageStatePanel>
    <template v-else-if="detail">
      <div class="flex justify-end">
        <button
          type="button"
          class="btn-secondary"
          :disabled="deleting || detail.readonly"
          @click="deletePreset"
        >
          {{ detail.readonly ? t('common.readonly') : deleting ? t('common.deleting') : t('presetDetail.deleteAction') }}
        </button>
      </div>

      <PageStatePanel v-if="actionMessage" tone="notice" tag="p">{{ actionMessage }}</PageStatePanel>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section class="panel">
          <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 class="section-heading">{{ t('presetDetail.skillMembership') }}</h3>
              <p class="mt-2 text-sm leading-6 text-muted">{{ t('presetDetail.membershipDescription') }}</p>
            </div>
            <div class="w-full md:w-[280px]">
              <PageSearchBar
                id="preset-skill-search"
                v-model="searchQuery"
                :label="t('common.search')"
                :placeholder="t('presetDetail.searchPlaceholder')"
              />
            </div>
          </div>

          <ul v-if="filteredSkillRows.length > 0" class="mt-4 space-y-2">
            <li v-for="skill in filteredSkillRows" :key="skill.name" class="membership-row">
              <div class="min-w-0">
                <p class="truncate font-semibold text-charcoal">{{ skill.name }}</p>
                <p class="mt-2 truncate text-xs text-muted">{{ skill.description || skill.path }}</p>
              </div>
              <button
                type="button"
                class="btn-secondary"
                :disabled="!skill.editable || actionBusy"
                @click="toggleSkill(skill)"
              >
                {{
                  skill.editable
                    ? actionBusy
                      ? t('common.updating')
                      : skill.included
                        ? t('common.remove')
                        : t('common.add')
                    : t('common.readonly')
                }}
              </button>
            </li>
          </ul>
          <p v-else class="mt-4 text-sm text-muted">{{ t('presetDetail.noMatch') }}</p>
        </section>

        <aside class="panel">
          <h3 class="section-heading">{{ t('presetDetail.affectedProjects') }}</h3>
          <p class="mt-2 text-sm leading-6 text-muted">
            {{ t('presetDetail.affectedProjectsDescription') }}
          </p>

          <ul v-if="detail.affectedProjects.length > 0" class="mt-4 space-y-2">
            <li v-for="project in detail.affectedProjects" :key="project.projectId">
              <button type="button" class="project-row" @click="openProjectDetail(project.projectId)">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-charcoal">{{ project.displayName }}</p>
                  <p class="mt-2 truncate text-xs text-muted" :title="project.projectPath">
                    {{ project.projectPath }}
                  </p>
                </div>
                <span class="text-xs font-semibold text-muted">{{ t('common.openProject') }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="mt-4 text-sm text-muted">{{ t('presetDetail.noAffectedProjects') }}</p>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.membership-row {
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

.project-row {
  width: 100%;
  border: 0;
  border-radius: 0.75rem;
  background: #f5f5f5;
  padding: 0.95rem 1rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  text-align: left;
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px;
  transition:
    transform 160ms ease,
    background-color 160ms ease;
}

.project-row:hover {
  background: #efefef;
  transform: translateY(-1px);
}
</style>
