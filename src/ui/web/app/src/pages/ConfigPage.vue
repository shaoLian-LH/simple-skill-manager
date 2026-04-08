<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';

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
  chooseFolderEndpoint: string | null;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

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

  const capabilities = asRecord(root.capabilities);
  const folderPicker = asRecord(root.folderPicker);
  const folderPickerSupported =
    (typeof capabilities?.folderPicker === 'boolean' && capabilities.folderPicker) ||
    (typeof folderPicker?.supported === 'boolean' && folderPicker.supported) ||
    false;

  const chooseFolderEndpointRaw =
    asString(capabilities?.chooseFolderEndpoint) ||
    asString(folderPicker?.endpoint) ||
    asString(root.chooseFolderEndpoint);

  return {
    skillsDir,
    defaultTargets,
    supportedTargets: supportedTargets.length > 0 ? supportedTargets : defaultTargets,
    paths,
    folderPickerSupported,
    chooseFolderEndpoint: chooseFolderEndpointRaw.length > 0 ? chooseFolderEndpointRaw : null,
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
    if (error instanceof ApiRequestError) {
      pageError.value = error.detail.message;
    } else {
      pageError.value = t('config.loadFailed');
    }
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
    if (error instanceof ApiRequestError) {
      pageError.value = error.detail.message;
      fieldErrors.value = error.detail.fieldErrors ?? {};
    } else {
      pageError.value = t('config.updateFailed');
    }
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
  const candidate = asString(record.path) || asString(record.selectedPath) || asString(record.skillsDir);
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

  const endpointCandidates = uniqueStrings(
    [activeBaseline.chooseFolderEndpoint, '/api/config/choose-folder', '/api/config/skills-dir/choose'].filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    ),
  );

  let pickedPath = '';
  for (const endpoint of endpointCandidates) {
    try {
      const payload = await apiRequest<unknown>(endpoint, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      pickedPath = extractPathFromPickerResponse(payload);
      if (pickedPath.length > 0) {
        break;
      }
    } catch {
      continue;
    }
  }

  if (pickedPath.length > 0) {
    draftSkillsDir.value = pickedPath;
    successMessage.value = t('config.folderSelected');
  } else {
    pageError.value = t('config.folderPickerHostUnavailable');
  }

  isPickingFolder.value = false;
}

onMounted(() => {
  void loadConfig();
});
</script>

<template>
  <section class="space-y-4">
    <section v-if="isLoading" class="panel text-sm text-ink/70">{{ t('config.loading') }}</section>

    <template v-else>
      <section class="panel">
        <div class="mt-2 grid gap-3 md:grid-cols-2">
          <div class="rounded-xl border border-ink/10 bg-paper/75 p-3">
            <p class="text-xs uppercase tracking-[0.12em] text-ink/60">{{ t('config.activeSkillsDir') }}</p>
            <p class="mt-1 break-all text-sm font-semibold text-ink">
              {{ baselineSummary.skillsDir || t('common.notConfigured') }}
            </p>
          </div>
          <div class="rounded-xl border border-ink/10 bg-paper/75 p-3">
            <p class="text-xs uppercase tracking-[0.12em] text-ink/60">{{ t('config.defaultTargets') }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="target in baselineSummary.defaultTargets"
                :key="`baseline-${target}`"
                class="rounded-full border border-copper/30 bg-copper/10 px-3 py-1 text-xs font-semibold text-copper"
              >
                {{ target }}
              </span>
              <span v-if="baselineSummary.defaultTargets.length === 0" class="text-sm text-ink/70">
                {{ t('config.noDefaultTarget') }}
              </span>
            </div>
          </div>
        </div>
        <p class="mt-3 text-sm text-ink/70">
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
              :disabled="isPickingFolder || isSaving"
              @click="chooseFolder"
            >
              {{ isPickingFolder ? t('common.choosingFolder') : t('config.chooseFolder') }}
            </button>
            <button type="button" class="btn-ghost" :disabled="isSaving" @click="copySkillsDir">{{ t('config.copyPath') }}</button>
          </div>
          <p class="mt-2 text-xs text-ink/70">
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
              class="rounded-full border px-3 py-1 text-sm font-semibold transition-colors"
              :class="
                draftTargets.includes(target)
                  ? 'border-copper/30 bg-copper/10 text-copper'
                  : 'border-ink/20 bg-white/80 text-ink/75 hover:border-copper/20 hover:text-copper'
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
          <p v-if="successMessage" class="text-sm text-emerald-700">{{ successMessage }}</p>
        </div>
        <p v-if="pageError" class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {{ pageError }}
        </p>
      </section>

      <section class="panel bg-white/60">
        <p class="field-label">{{ t('config.storagePaths') }}</p>
        <p class="mt-1 text-sm text-ink/70">{{ t('config.storagePathsDescription') }}</p>
        <ul class="mt-3 space-y-2 text-sm text-ink/75">
          <li class="break-all">
            <span class="font-semibold text-ink">config.json:</span>
            {{ baseline?.paths?.configFile || t('config.notAvailable') }}
          </li>
          <li class="break-all">
            <span class="font-semibold text-ink">presets.yaml:</span>
            {{ baseline?.paths?.presetsFile || t('config.notAvailable') }}
          </li>
          <li class="break-all">
            <span class="font-semibold text-ink">projects.json:</span>
            {{ baseline?.paths?.projectsFile || t('config.notAvailable') }}
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
