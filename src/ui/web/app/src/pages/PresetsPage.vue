<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import { sourceStateLabel } from '../../../../text.js';
import type { PresetsView, PresetView } from '../types';

const router = useRouter();
const setQuickActions = useSetQuickActions();
const { locale, t, withLocalePath } = useUiI18n();

const loading = ref(true);
const errorMessage = ref('');
const searchQuery = ref('');
const presets = ref<PresetView[]>([]);

const filteredPresets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (query.length === 0) {
    return presets.value;
  }

  return presets.value.filter((preset) => {
    return (
      preset.name.toLowerCase().includes(query) ||
      preset.source.toLowerCase().includes(query) ||
      String(preset.skillCount).includes(query) ||
      String(preset.referenceCount).includes(query)
    );
  });
});

useWorkspaceSpine(() => ({
  scopeLabel: t('presets.title'),
  scopeDescription:
    presets.value.length > 0
      ? t('presets.showingCount', { shown: filteredPresets.value.length, total: presets.value.length })
      : errorMessage.value || t('presets.scopeDescription'),
}));

function formatSummary(preset: PresetView): string {
  return t('presets.summary', {
    skillCount: preset.skillCount,
    projectCount: preset.referenceCount,
  });
}

async function loadPresets(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  setQuickActions([]);

  try {
    const payload = await apiRequest<PresetsView>('/api/presets');
    presets.value = [...payload.items].sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    if (error instanceof ApiRequestError) {
      errorMessage.value = error.detail.message;
    } else {
      errorMessage.value = t('presets.loadFailed');
    }
  } finally {
    loading.value = false;
  }
}

function openPresetDetail(name: string): void {
  void router.push(withLocalePath(`/presets/${encodeURIComponent(name)}`));
}

onMounted(() => {
  void loadPresets();
});
</script>

<template>
  <section class="space-y-4">
    <header class="panel">
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <p class="text-sm text-ink/70">
          {{ t('presets.showingCount', { shown: filteredPresets.length, total: presets.length }) }}
        </p>
      </div>

      <div class="mt-4">
        <label class="field-label" for="preset-search">{{ t('common.search') }}</label>
        <input
          id="preset-search"
          v-model="searchQuery"
          class="text-input"
          type="search"
          :placeholder="t('presets.searchPlaceholder')"
        />
      </div>
    </header>

    <section v-if="loading" class="panel text-sm text-ink/70">{{ t('presets.loading') }}</section>
    <section v-else-if="errorMessage" class="panel border-red-200 bg-red-50 text-sm text-red-800">
      {{ errorMessage }}
    </section>
    <section v-else-if="presets.length === 0" class="panel text-sm text-ink/70">
      {{ t('presets.empty') }}
    </section>
    <section v-else-if="filteredPresets.length === 0" class="panel text-sm text-ink/70">
      {{ t('presets.noMatch') }}
    </section>
    <ul v-else class="space-y-2">
      <li v-for="preset in filteredPresets" :key="preset.name">
        <button type="button" class="preset-index-row" @click="openPresetDetail(preset.name)">
          <div class="min-w-0">
            <p class="truncate font-semibold text-ink">{{ preset.name }}</p>
            <p class="mt-1 text-xs text-ink/70">{{ formatSummary(preset) }}</p>
          </div>
          <span
            class="rounded-full border px-2.5 py-1 text-xs font-semibold"
            :class="
              preset.readonly
                ? 'border-ink/25 bg-white/80 text-ink/80'
                : preset.source === 'dynamic'
                  ? 'border-olive/40 bg-olive/10 text-olive'
                  : 'border-copper/40 bg-copper/10 text-copper'
            "
          >
            {{ sourceStateLabel(locale, preset.source, preset.readonly) }}
          </span>
          <span class="text-xs font-semibold text-ink/70">{{ t('common.openDetail') }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.preset-index-row {
  width: 100%;
  border: 1px solid rgba(45, 38, 31, 0.1);
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.66);
  padding: 0.75rem 0.85rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
  text-align: left;
  transition: border-color 160ms ease, background-color 160ms ease;
}

.preset-index-row:hover {
  border-color: rgba(186, 106, 63, 0.35);
  background: rgba(247, 238, 227, 0.82);
}
</style>
