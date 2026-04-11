<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import PageStatePanel from '../components/PageStatePanel.vue';
import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { asRecord, asString, asStringArray } from '../lib/coerce';
import { useUiI18n } from '../lib/i18n';
import { resolveRequestErrorMessage } from '../lib/page';

interface ConfigStoragePaths {
  configFile: string;
  presetsFile: string;
  projectsFile: string;
}

interface ConfigBaseline {
  skillsDir: string;
  defaultTargets: string[];
  supportedTargets: string[];
  paths: ConfigStoragePaths | null;
  folderPickerSupported: boolean;
}

const setQuickActions = useSetQuickActions();
const { t } = useUiI18n();

const isLoading = ref(true);
const isSaving = ref(false);
const isPickingFolder = ref(false);
const pageError = ref('');
const successMessage = ref('');

const draftSkillsDir = ref('');
const draftTargets = ref<string[]>([]);
const baseline = ref<ConfigBaseline | null>(null);
const fieldErrors = ref<Record<string, string>>({});

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeConfig(value: unknown): ConfigBaseline {
  const root = asRecord(value) ?? {};
  const skillsDir = asString(root.skillsDir);
  const defaultTargets = uniqueStrings(asStringArray(root.defaultTargets));
  const supportedTargets = uniqueStrings(asStringArray(root.supportedTargets));

  const pathsRecord = asRecord(root.paths);
  const paths: ConfigStoragePaths | null = pathsRecord
    ? {
        configFile: asString(pathsRecord.configFile),
        presetsFile: asString(pathsRecord.presetsFile),
        projectsFile: asString(pathsRecord.projectsFile),
      }
    : null;

  const folderPicker = asRecord(root.folderPicker);
  const folderPickerSupported = typeof folderPicker?.supported === 'boolean' && folderPicker.supported;

  return {
    skillsDir,
    defaultTargets,
    supportedTargets: supportedTargets.length > 0 ? supportedTargets : defaultTargets,
    paths,
    folderPickerSupported,
  };
}

function setDraftFromBaseline(nextBaseline: ConfigBaseline): void {
  draftSkillsDir.value = nextBaseline.skillsDir;
  draftTargets.value = [...nextBaseline.defaultTargets];
}

const availableTargets = computed(() => baseline.value?.supportedTargets ?? []);

const baselineSummary = computed(() => {
  const activeBaseline = baseline.value;
  if (!activeBaseline) {
    return {
      skillsDir: '',
      defaultTargets: [] as string[],
      supportedTargetCount: 0,
      usesManualEntry: true,
    };
  }

  return {
    skillsDir: activeBaseline.skillsDir,
    defaultTargets: activeBaseline.defaultTargets,
    supportedTargetCount: activeBaseline.supportedTargets.length,
    usesManualEntry: !activeBaseline.folderPickerSupported,
  };
});

useWorkspaceSpine(() => ({
  scopeLabel: t('nav.config'),
  scopeDescription: pageError.value
    ? pageError.value
    : `${t('config.supportedTargets', { count: baselineSummary.value.supportedTargetCount })} ${
        baselineSummary.value.usesManualEntry ? t('config.manualEntry') : t('config.pickerAvailable')
      }`,
}));

function clearMessages(): void {
  successMessage.value = '';
  pageError.value = '';
}

async function loadConfig(): Promise<void> {
  isLoading.value = true;
  fieldErrors.value = {};
  clearMessages();
  setQuickActions([]);

  try {
    const payload = await apiRequest<unknown>('/api/config');
    const nextBaseline = normalizeConfig(payload);
    baseline.value = nextBaseline;
    setDraftFromBaseline(nextBaseline);
  } catch (error) {
    pageError.value = resolveRequestErrorMessage(error, t('config.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}

function toggleTarget(target: string): void {
  const next = new Set(draftTargets.value);
  if (next.has(target)) {
    next.delete(target);
  } else {
    next.add(target);
  }
  draftTargets.value = [...next];
}

function validateDraft(): boolean {
  const nextFieldErrors: Record<string, string> = {};

  if (draftSkillsDir.value.trim().length === 0) {
    nextFieldErrors.skillsDir = t('config.pathRequired');
  }

  fieldErrors.value = nextFieldErrors;
  return Object.keys(nextFieldErrors).length === 0;
}

async function saveConfig(): Promise<void> {
  clearMessages();
  if (!validateDraft()) {
    return;
  }

  isSaving.value = true;
  fieldErrors.value = {};

  try {
    const payload = await apiRequest<unknown>('/api/config', {
      method: 'POST',
      body: JSON.stringify({
        skillsDir: draftSkillsDir.value.trim(),
        defaultTargets: draftTargets.value,
      }),
    });

    const nextBaseline = normalizeConfig(payload);
    baseline.value = nextBaseline;
    setDraftFromBaseline(nextBaseline);
    successMessage.value = t('config.updated');
  } catch (error) {
    pageError.value = resolveRequestErrorMessage(error, t('config.updateFailed'));
    fieldErrors.value = error instanceof ApiRequestError ? (error.detail.fieldErrors ?? {}) : {};
  } finally {
    isSaving.value = false;
  }
}

async function copySkillsDir(): Promise<void> {
  clearMessages();
  try {
    await navigator.clipboard.writeText(draftSkillsDir.value);
    successMessage.value = t('config.copied');
  } catch {
    pageError.value = t('config.clipboardUnavailable');
  }
}

function extractPathFromPickerResponse(value: unknown): string {
  const record = asRecord(value) ?? {};
  const candidate = asString(record.path);
  return candidate.trim();
}

async function chooseFolder(): Promise<void> {
  clearMessages();
  const activeBaseline = baseline.value;
  if (!activeBaseline) {
    return;
  }

  if (!activeBaseline.folderPickerSupported) {
    pageError.value = t('config.folderPickerUnavailable');
    return;
  }

  isPickingFolder.value = true;

  try {
    const payload = await apiRequest<{ path: string | null; canceled: boolean }>('/api/config/skills-dir/pick', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (payload.canceled) {
      return;
    }

    const pickedPath = extractPathFromPickerResponse(payload);
    if (pickedPath.length > 0) {
      draftSkillsDir.value = pickedPath;
      successMessage.value = t('config.folderSelected');
      return;
    }

    pageError.value = t('config.folderPickerHostUnavailable');
  } catch (error) {
    pageError.value = resolveRequestErrorMessage(error, t('config.folderPickerHostUnavailable'));
  } finally {
    isPickingFolder.value = false;
  }
}

onMounted(() => {
  void loadConfig();
});
</script>

<template>
  <section class="space-y-4">
    <PageStatePanel v-if="isLoading">{{ t('config.loading') }}</PageStatePanel>

    <template v-else>
      <section class="panel">
        <div class="mt-2 grid gap-3 md:grid-cols-2">
          <div class="metric-card">
            <p class="metric-label">{{ t('config.activeSkillsDir') }}</p>
            <p class="mt-2 break-all text-sm font-semibold leading-6 text-charcoal">
              {{ baselineSummary.skillsDir || t('common.notConfigured') }}
            </p>
          </div>
          <div class="metric-card">
            <p class="metric-label">{{ t('config.defaultTargets') }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="target in baselineSummary.defaultTargets"
                :key="`baseline-${target}`"
                class="chip-subtle"
              >
                {{ target }}
              </span>
              <span v-if="baselineSummary.defaultTargets.length === 0" class="text-sm text-muted">
                {{ t('config.noDefaultTarget') }}
              </span>
            </div>
          </div>
        </div>
        <p class="mt-4 text-sm leading-6 text-muted">
          {{ t('config.supportedTargets', { count: baselineSummary.supportedTargetCount }) }}
          {{ baselineSummary.usesManualEntry ? t('config.manualEntry') : t('config.pickerAvailable') }}
        </p>
      </section>

      <section class="panel">
        <p class="field-label">{{ t('config.workspaceConfig') }}</p>

        <div class="mt-3">
          <label class="field-label" for="skills-dir-input">skillsDir</label>
          <input
            id="skills-dir-input"
            v-model="draftSkillsDir"
            type="text"
            class="text-input"
            autocomplete="off"
            spellcheck="false"
            placeholder="/path/to/skills"
          />
          <p v-if="fieldErrors.skillsDir" class="error-text">{{ fieldErrors.skillsDir }}</p>

          <div class="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn-secondary"
              :disabled="isPickingFolder || isSaving || !baseline?.folderPickerSupported"
              @click="chooseFolder"
            >
              {{ isPickingFolder ? t('common.choosingFolder') : t('config.chooseFolder') }}
            </button>
            <button type="button" class="btn-ghost" :disabled="isSaving" @click="copySkillsDir">{{ t('config.copyPath') }}</button>
          </div>
          <p class="mt-2 text-xs text-muted">
            {{ t('config.pickerUnavailableHint') }}
          </p>
        </div>

        <div class="mt-5">
          <p class="field-label">defaultTargets</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="target in availableTargets"
              :key="`target-${target}`"
              type="button"
              class="text-xs"
              :class="
                draftTargets.includes(target)
                  ? 'chip-solid'
                  : 'chip'
              "
              :aria-pressed="draftTargets.includes(target)"
              @click="toggleTarget(target)"
            >
              {{ target }}
            </button>
          </div>
          <p v-if="fieldErrors.defaultTargets" class="error-text">{{ fieldErrors.defaultTargets }}</p>
        </div>

        <div class="mt-5 flex items-center gap-3">
          <button type="button" class="btn-primary" :disabled="isSaving || isPickingFolder" @click="saveConfig">
            {{ isSaving ? t('common.saving') : t('config.saveConfig') }}
          </button>
          <p v-if="successMessage" class="text-sm text-muted">{{ successMessage }}</p>
        </div>
        <PageStatePanel v-if="pageError" tone="error" class="mt-3">{{ pageError }}</PageStatePanel>
      </section>

      <section class="panel">
        <p class="field-label">{{ t('config.storagePaths') }}</p>
        <p class="mt-2 text-sm leading-6 text-muted">{{ t('config.storagePathsDescription') }}</p>
        <ul class="mt-4 space-y-3 text-sm leading-6 text-muted">
          <li class="break-all">
            <span class="font-semibold text-charcoal">config.json:</span>
            {{ baseline?.paths?.configFile || t('config.notAvailable') }}
          </li>
          <li class="break-all">
            <span class="font-semibold text-charcoal">presets.yaml:</span>
            {{ baseline?.paths?.presetsFile || t('config.notAvailable') }}
          </li>
          <li class="break-all">
            <span class="font-semibold text-charcoal">projects.json:</span>
            {{ baseline?.paths?.projectsFile || t('config.notAvailable') }}
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
