<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import PageSearchBar from '../components/PageSearchBar.vue';
import PageStatePanel from '../components/PageStatePanel.vue';
import { apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import { useLocalizedNavigation } from '../lib/navigation';
import { resolveRequestErrorMessage } from '../lib/page';
import { sourceStateLabel } from '../../../../text.js';
import type { PresetsView, PresetView } from '../types';

const setQuickActions = useSetQuickActions();
const { locale, t } = useUiI18n();
const { pushPath } = useLocalizedNavigation();

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
  scopeDescription: errorMessage.value || t('presets.scopeDescription'),
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
    errorMessage.value = resolveRequestErrorMessage(error, t('presets.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function openPresetDetail(name: string): void {
  void pushPath(`/presets/${encodeURIComponent(name)}`);
}

onMounted(() => {
  void loadPresets();
});
</script>

<template>
  <section class="space-y-4">
    <PageSearchBar
      id="preset-search"
      v-model="searchQuery"
      :label="t('common.search')"
      :placeholder="t('presets.searchPlaceholder')"
    />

    <PageStatePanel v-if="loading">{{ t('presets.loading') }}</PageStatePanel>
    <PageStatePanel v-else-if="errorMessage" tone="error">{{ errorMessage }}</PageStatePanel>
    <PageStatePanel v-else-if="presets.length === 0">{{ t('presets.empty') }}</PageStatePanel>
    <PageStatePanel v-else-if="filteredPresets.length === 0">{{ t('presets.noMatch') }}</PageStatePanel>
    <ul v-else class="space-y-2">
      <li v-for="preset in filteredPresets" :key="preset.name">
        <button type="button" class="preset-index-row" @click="openPresetDetail(preset.name)">
          <div class="min-w-0">
            <p class="truncate font-semibold text-charcoal">{{ preset.name }}</p>
            <p class="mt-2 text-xs text-muted">{{ formatSummary(preset) }}</p>
          </div>
          <span
            :class="
              preset.readonly
                ? 'chip'
                : preset.source === 'dynamic'
                  ? 'chip-subtle'
                  : 'chip-solid'
            "
          >
            {{ sourceStateLabel(locale, preset.source, preset.readonly) }}
          </span>
          <span class="text-xs font-semibold text-muted">{{ t('common.openDetail') }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.preset-index-row {
  width: 100%;
  border: 0;
  border-radius: 1rem;
  background: #ffffff;
  padding: 1rem 1.1rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
  text-align: left;
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px,
    rgba(34, 42, 53, 0.05) 0px 4px 8px 0px;
  transition:
    transform 160ms ease,
    background-color 160ms ease;
}

.preset-index-row:hover {
  background: #f5f5f5;
  transform: translateY(-1px);
}
</style>
