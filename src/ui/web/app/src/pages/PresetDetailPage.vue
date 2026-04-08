<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions, useSetWorkspaceContext } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import { sourceStateLabel } from '../../../../text.js';
import type {
  PresetDeletePreviewView,
  PresetDeleteView,
  PresetDetailView,
  PresetSkillMembershipView,
} from '../types';

const route = useRoute();
const router = useRouter();
const setQuickActions = useSetQuickActions();
const setWorkspaceContext = useSetWorkspaceContext();
const { locale, t, withLocalePath } = useUiI18n();

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
    scopeLabel: t('presetDetail.scopeLabel'),
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
      apiRequest<PresetDeletePreviewView>(`/api/presets/${encodeURIComponent(name)}/delete-preview`),
    ]);

    detail.value = detailPayload;
    deletePreview.value = previewPayload;
    buildWorkspaceContext(detailPayload);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      errorMessage.value = error.detail.message;
    } else {
      errorMessage.value = t('presetDetail.loadFailed');
    }
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
    if (error instanceof ApiRequestError) {
      actionMessage.value = error.detail.message;
    } else {
      actionMessage.value = t('presetDetail.updateFailed', { name: skill.name });
    }
  } finally {
    actionBusy.value = false;
  }
}

function buildDeleteConfirmation(preview: PresetDeletePreviewView): string {
  if (preview.referenceProjects.length === 0) {
    return t('presetDetail.deleteConfirmEmpty', { name: preview.name });
  }

  const affected = preview.referenceProjects
    .slice(0, 8)
    .map((project) => `- ${project.projectPath}`)
    .join('\n');

  const suffix = preview.referenceProjects.length > 8 ? '\n- ...' : '';
  return t('presetDetail.deleteConfirmWithRefs', {
    name: preview.name,
    count: preview.referenceCount,
    projects: affected + suffix,
  });
}

async function deletePreset(): Promise<void> {
  const current = detail.value;
  if (!current || deleting.value) {
    return;
  }

  deleting.value = true;
  actionMessage.value = '';

  try {
    const preview = await apiRequest<PresetDeletePreviewView>(`/api/presets/${encodeURIComponent(current.name)}/delete-preview`);
    deletePreview.value = preview;

    if (preview.readonly) {
      actionMessage.value = t('presetDetail.readonlyDeleteBlocked', { name: preview.name });
      return;
    }

    if (!window.confirm(buildDeleteConfirmation(preview))) {
      return;
    }

    const result = await apiRequest<PresetDeleteView>(`/api/presets/${encodeURIComponent(current.name)}`, {
      method: 'DELETE',
    });
    actionMessage.value = t('presetDetail.deleted', { name: result.deleted.name });
    await router.replace(withLocalePath('/presets'));
  } catch (error) {
    if (error instanceof ApiRequestError) {
      actionMessage.value = error.detail.message;
    } else {
      actionMessage.value = t('presetDetail.deleteFailed');
    }
  } finally {
    deleting.value = false;
  }
}

function openProjectDetail(projectId: string): void {
  void router.push(withLocalePath(`/projects/${encodeURIComponent(projectId)}`));
}

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
    <section v-if="loading" class="panel text-sm text-ink/70">{{ t('presetDetail.loading') }}</section>
    <section v-else-if="errorMessage" class="panel border-red-200 bg-red-50 text-sm text-red-800">
      {{ errorMessage }}
    </section>
    <template v-else-if="detail">
      <header class="panel">
        <p class="field-label">{{ t('presetDetail.workspaceLabel') }}</p>
        <div class="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <h3 class="truncate font-display text-2xl text-ink">{{ detail.name }}</h3>
            <div class="mt-2 flex flex-wrap gap-2">
              <span
                class="rounded-full border px-2.5 py-1 text-xs font-semibold"
                :class="
                  detail.readonly
                    ? 'border-ink/25 bg-white/80 text-ink/80'
                    : detail.source === 'dynamic'
                      ? 'border-olive/40 bg-olive/10 text-olive'
                      : 'border-copper/40 bg-copper/10 text-copper'
                "
              >
                {{ sourceStateLabel(locale, detail.source, detail.readonly) }}
              </span>
              <span class="rounded-full border border-ink/20 bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink/80">
                {{ t('presetDetail.skillCount', { count: detail.skillCount }) }}
              </span>
              <span class="rounded-full border border-ink/20 bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink/80">
                {{ t('presetDetail.projectCount', { count: detail.referenceCount }) }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="btn-secondary"
            :disabled="deleting || detail.readonly"
            @click="deletePreset"
          >
            {{ detail.readonly ? t('common.readonly') : deleting ? t('common.deleting') : t('presetDetail.deleteAction') }}
          </button>
        </div>
      </header>

      <p
        v-if="actionMessage"
        class="rounded-xl border border-copper/30 bg-copper/10 px-3 py-2 text-sm text-ink"
      >
        {{ actionMessage }}
      </p>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section class="panel">
          <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="field-label">{{ t('presetDetail.skillMembership') }}</p>
              <p class="mt-1 text-sm text-ink/70">{{ t('presetDetail.membershipDescription') }}</p>
            </div>
            <div class="w-full md:w-[280px]">
              <label class="field-label" for="preset-skill-search">{{ t('common.search') }}</label>
              <input
                id="preset-skill-search"
                v-model="searchQuery"
                class="text-input"
                type="search"
                :placeholder="t('presetDetail.searchPlaceholder')"
              />
            </div>
          </div>

          <ul v-if="filteredSkillRows.length > 0" class="mt-4 space-y-2">
            <li v-for="skill in filteredSkillRows" :key="skill.name" class="membership-row">
              <div class="min-w-0">
                <p class="truncate font-semibold text-ink">{{ skill.name }}</p>
                <p class="mt-1 truncate text-xs text-ink/70">{{ skill.description || skill.path }}</p>
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
                        ? t('presetDetail.toggleRemove')
                        : t('presetDetail.toggleAdd')
                    : t('common.readonly')
                }}
              </button>
            </li>
          </ul>
          <p v-else class="mt-4 text-sm text-ink/70">{{ t('presetDetail.noMatch') }}</p>
        </section>

        <aside class="panel">
          <p class="field-label">{{ t('presetDetail.affectedProjects') }}</p>
          <p class="mt-1 text-sm text-ink/70">
            {{ t('presetDetail.affectedProjectsDescription') }}
          </p>

          <ul v-if="detail.affectedProjects.length > 0" class="mt-4 space-y-2">
            <li v-for="project in detail.affectedProjects" :key="project.projectId">
              <button type="button" class="project-row" @click="openProjectDetail(project.projectId)">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-ink">{{ project.displayName }}</p>
                  <p class="mt-1 truncate text-xs text-ink/70" :title="project.projectPath">
                    {{ project.projectPath }}
                  </p>
                </div>
                <span class="text-xs font-semibold text-ink/70">{{ t('common.openProject') }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="mt-4 text-sm text-ink/70">{{ t('presetDetail.noAffectedProjects') }}</p>
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
  border: 1px solid rgba(45, 38, 31, 0.1);
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.66);
  padding: 0.7rem 0.8rem;
}

.project-row {
  width: 100%;
  border: 1px solid rgba(45, 38, 31, 0.1);
  border-radius: 0.9rem;
  background: rgba(247, 238, 227, 0.6);
  padding: 0.7rem 0.8rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  text-align: left;
  transition: border-color 160ms ease, background-color 160ms ease;
}

.project-row:hover {
  border-color: rgba(186, 106, 63, 0.35);
  background: rgba(247, 238, 227, 0.84);
}
</style>
