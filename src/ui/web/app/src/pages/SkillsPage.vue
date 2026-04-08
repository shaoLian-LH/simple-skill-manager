<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';

interface ProjectIntersectionView {
  id: string;
  label: string;
  note: string;
}

interface SkillCardView {
  key: string;
  name: string;
  description: string;
  path: string;
  globalEnabled: boolean;
  updatedAt: string | null;
  directProjects: ProjectIntersectionView[];
  viaPresetProjects: ProjectIntersectionView[];
}

interface SkillsApiPayload {
  items?: unknown;
  skills?: unknown;
}

const setQuickActions = useSetQuickActions();
const { t, formatDateTime } = useUiI18n();

const loading = ref(true);
const errorMessage = ref('');
const searchQuery = ref('');
const cards = ref<SkillCardView[]>([]);
const flippedCards = ref<Set<string>>(new Set());

const filteredCards = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (query.length === 0) {
    return cards.value;
  }

  return cards.value.filter((card) => {
    const searchBlob = [
      card.name,
      card.description,
      card.path,
      card.directProjects.map((project) => project.label).join(' '),
      card.viaPresetProjects.map((project) => `${project.label} ${project.note}`).join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return searchBlob.includes(query);
  });
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function formatProjectLabel(record: Record<string, unknown>): { id: string; label: string } {
  const projectId = asString(record.projectId);
  const projectPath = asString(record.projectPath);
  const projectName = asString(record.projectName) || asString(record.name);
  const label = projectPath || projectName || projectId || t('common.unknownProject');
  const id = projectId || projectPath || projectName || label;
  return { id, label };
}

function toProjectIntersections(source: unknown): ProjectIntersectionView[] {
  if (!Array.isArray(source)) {
    return [];
  }

  const seen = new Set<string>();
  const rows: ProjectIntersectionView[] = [];

  for (const entry of source) {
    if (typeof entry === 'string') {
      const id = entry;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      rows.push({ id, label: entry, note: '' });
      continue;
    }

    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const { id, label } = formatProjectLabel(record);
    const viaPreset = asStringArray(record.viaPresets);
    const viaPresetNames = asStringArray(record.viaPresetNames);
    const mergedPresetNames = [...new Set([...viaPreset, ...viaPresetNames])];
    const note = mergedPresetNames.length > 0 ? t('skills.viaPresetNote', { names: mergedPresetNames.join(', ') }) : '';
    const dedupeKey = `${id}::${note}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    rows.push({ id, label, note });
  }

  return rows;
}

function normalizeSkillCard(item: unknown, index: number): SkillCardView {
  const record = asRecord(item) ?? {};
  const name = asString(record.name, `skill-${index + 1}`);
  const description = asString(record.description, t('skills.noDescription'));
  const path = asString(record.path, t('skills.unknownLocation'));
  const globalEnabled = asBoolean(record.globalEnabled, asBoolean(record.enabled, false));
  const updatedAt = asString(record.updatedAt) || null;

  const directProjects = toProjectIntersections(
    record.directProjects ?? record.directProjectIds ?? record.directProjectPaths ?? [],
  );

  const viaPresetProjects = toProjectIntersections(
    record.viaPresetProjects ?? record.viaPresetProjectIds ?? record.viaPresetProjectPaths ?? [],
  );

  return {
    key: `${name}-${index}`,
    name,
    description,
    path,
    globalEnabled,
    updatedAt,
    directProjects,
    viaPresetProjects,
  };
}

function isFlipped(cardKey: string): boolean {
  return flippedCards.value.has(cardKey);
}

function toggleCard(cardKey: string): void {
  const next = new Set(flippedCards.value);
  if (next.has(cardKey)) {
    next.delete(cardKey);
  } else {
    next.add(cardKey);
  }
  flippedCards.value = next;
}

async function loadSkills(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  setQuickActions([]);

  try {
    const payload = await apiRequest<SkillsApiPayload>('/api/skills');
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.skills) ? payload.skills : [];
    cards.value = items.map((item, index) => normalizeSkillCard(item, index));
  } catch (error) {
    if (error instanceof ApiRequestError) {
      errorMessage.value = error.detail.message;
    } else {
      errorMessage.value = t('skills.loadFailed');
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadSkills();
});
</script>

<template>
  <section class="space-y-4">
    <header class="panel">
      <p class="field-label">{{ t('skills.workspaceLabel') }}</p>
      <div class="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 class="font-display text-2xl text-ink">{{ t('skills.title') }}</h3>
          <p class="mt-1 text-sm text-ink/70">{{ t('skills.description') }}</p>
        </div>
        <p class="text-sm text-ink/70">
          {{ t('skills.showingCount', { shown: filteredCards.length, total: cards.length }) }}
        </p>
      </div>
      <div class="mt-4">
        <label class="field-label" for="skill-search">{{ t('common.search') }}</label>
        <input
          id="skill-search"
          v-model="searchQuery"
          type="search"
          class="text-input"
          :placeholder="t('skills.searchPlaceholder')"
        />
      </div>
    </header>

    <section v-if="loading" class="panel text-sm text-ink/70">{{ t('skills.loading') }}</section>
    <section v-else-if="errorMessage" class="panel border-red-200 bg-red-50 text-sm text-red-800">
      {{ errorMessage }}
    </section>
    <section v-else-if="cards.length === 0" class="panel text-sm text-ink/70">
      {{ t('skills.empty') }}
    </section>
    <section v-else-if="filteredCards.length === 0" class="panel text-sm text-ink/70">
      {{ t('skills.noMatch') }}
    </section>
    <ul v-else class="space-y-4">
      <li v-for="card in filteredCards" :key="card.key" class="skill-card-shell">
        <div class="skill-card-inner" :class="{ flipped: isFlipped(card.key) }">
          <article class="skill-face skill-face-front panel">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="field-label">{{ t('skills.summaryLabel') }}</p>
                <h4 class="mt-1 font-display text-2xl text-ink">{{ card.name }}</h4>
              </div>
              <span
                class="rounded-full border px-3 py-1 text-xs font-semibold"
                :class="
                  card.globalEnabled
                    ? 'border-emerald-700/30 bg-emerald-50 text-emerald-800'
                    : 'border-ink/20 bg-white/75 text-ink/80'
                "
              >
                {{ card.globalEnabled ? t('common.enabled') : t('common.disabled') }}
              </span>
            </div>

            <p class="mt-3 text-sm text-ink/75">{{ card.description }}</p>

            <dl class="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <dt class="field-label">{{ t('skills.location') }}</dt>
                <dd class="mt-1 break-all text-sm text-ink/75">{{ card.path }}</dd>
              </div>
              <div>
                <dt class="field-label">{{ t('skills.updated') }}</dt>
                <dd class="mt-1 text-sm text-ink/75">{{ formatDateTime(card.updatedAt) }}</dd>
              </div>
            </dl>

            <div class="mt-4">
              <button type="button" class="btn-secondary" @click="toggleCard(card.key)">{{ t('skills.usage') }}</button>
            </div>
          </article>

          <article class="skill-face skill-face-back panel">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="field-label">{{ t('skills.intersection') }}</p>
                <h4 class="mt-1 font-display text-2xl text-ink">{{ card.name }}</h4>
              </div>
              <button type="button" class="btn-ghost" @click="toggleCard(card.key)">{{ t('common.back') }}</button>
            </div>

            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <section class="rounded-xl border border-ink/10 bg-white/70 p-3">
                <p class="field-label">{{ t('skills.directProjects') }}</p>
                <ul v-if="card.directProjects.length > 0" class="mt-2 space-y-2">
                  <li
                    v-for="project in card.directProjects"
                    :key="`direct-${card.key}-${project.id}`"
                    class="rounded-lg border border-ink/10 bg-paper/80 px-3 py-2 text-sm text-ink/80"
                  >
                    {{ project.label }}
                  </li>
                </ul>
                <p v-else class="mt-2 text-sm text-ink/70">
                  {{ t('skills.noDirectProjects') }}
                </p>
              </section>

              <section class="rounded-xl border border-ink/10 bg-white/70 p-3">
                <p class="field-label">{{ t('skills.viaPreset') }}</p>
                <ul v-if="card.viaPresetProjects.length > 0" class="mt-2 space-y-2">
                  <li
                    v-for="project in card.viaPresetProjects"
                    :key="`preset-${card.key}-${project.id}`"
                    class="rounded-lg border border-ink/10 bg-paper/80 px-3 py-2 text-sm text-ink/80"
                  >
                    <p>{{ project.label }}</p>
                    <p v-if="project.note" class="text-xs text-ink/60">{{ project.note }}</p>
                  </li>
                </ul>
                <p v-else class="mt-2 text-sm text-ink/70">
                  {{ t('skills.noViaPresetProjects') }}
                </p>
              </section>
            </div>
          </article>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.skill-card-shell {
  perspective: 1400px;
}

.skill-card-inner {
  position: relative;
  min-height: 320px;
  transform-style: preserve-3d;
  transition: transform 380ms ease;
}

.skill-card-inner.flipped {
  transform: rotateY(180deg);
}

.skill-face {
  width: 100%;
  backface-visibility: hidden;
}

.skill-face-front {
  position: relative;
}

.skill-face-back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .skill-card-shell {
    perspective: none;
  }

  .skill-card-inner {
    min-height: 0;
    transform: none !important;
    transition: none;
  }

  .skill-face {
    position: static;
    transform: none;
    backface-visibility: visible;
  }

  .skill-face-back {
    display: none;
  }

  .skill-card-inner.flipped .skill-face-front {
    display: none;
  }

  .skill-card-inner.flipped .skill-face-back {
    display: block;
  }
}
</style>
