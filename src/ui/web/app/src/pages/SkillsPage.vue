<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';

interface ProjectIntersectionView {
  id: string;
  projectId: string;
  displayLabel: string;
  fullPath: string;
  note: string;
  openMode: 'project' | 'project-parent';
}

interface SkillCardView {
  key: string;
  name: string;
  description: string;
  path: string;
  displayPath: string;
  fullPath: string;
  openPath: string;
  locationKind: 'direct' | 'dynamic-preset';
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
const loadError = ref('');
const actionError = ref('');
const searchQuery = ref('');
const cards = ref<SkillCardView[]>([]);
const flippedCards = ref<Set<string>>(new Set());
const pendingCardKeys = ref<Set<string>>(new Set());
const pendingLocationKeys = ref<Set<string>>(new Set());
const pendingProjectKeys = ref<Set<string>>(new Set());

const filteredCards = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (query.length === 0) {
    return cards.value;
  }

  return cards.value.filter((card) => {
    const searchBlob = [
      card.name,
      card.description,
      card.displayPath,
      card.fullPath,
      card.path,
      card.directProjects.map((project) => `${project.displayLabel} ${project.fullPath}`).join(' '),
      card.viaPresetProjects.map((project) => `${project.displayLabel} ${project.fullPath} ${project.note}`).join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return searchBlob.includes(query);
  });
});

useWorkspaceSpine(() => ({
  scopeLabel: t('nav.skills'),
  scopeDescription:
    cards.value.length > 0
      ? t('skills.showingCount', { shown: filteredCards.value.length, total: cards.value.length })
      : loadError.value || actionError.value || t('skills.description'),
}));

function onCardKeydown(event: KeyboardEvent, cardKey: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  toggleCard(cardKey);
}

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

function getLastPathSegment(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? input;
}

function formatProjectLabel(record: Record<string, unknown>): {
  id: string;
  projectId: string;
  displayLabel: string;
  fullPath: string;
} {
  const projectId = asString(record.projectId);
  const projectPath = asString(record.projectPath);
  const projectName = asString(record.displayName) || asString(record.projectName) || asString(record.name);
  const fullPath = projectPath || projectName || projectId || t('common.unknownProject');
  const displayLabel = projectName || getLastPathSegment(projectPath) || fullPath;
  const id = projectId || projectPath || projectName || fullPath;
  return { id, projectId: projectId || id, displayLabel, fullPath };
}

function toProjectIntersections(source: unknown, openMode: 'project' | 'project-parent'): ProjectIntersectionView[] {
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
      rows.push({
        id,
        projectId: id,
        displayLabel: getLastPathSegment(entry),
        fullPath: entry,
        note: '',
        openMode,
      });
      continue;
    }

    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const { id, projectId, displayLabel, fullPath } = formatProjectLabel(record);
    const viaPreset = asStringArray(record.viaPresets);
    const viaPresetNames = asStringArray(record.viaPresetNames);
    const mergedPresetNames = [...new Set([...viaPreset, ...viaPresetNames])];
    const note = mergedPresetNames.length > 0 ? t('skills.viaPresetNote', { names: mergedPresetNames.join(', ') }) : '';
    const dedupeKey = `${id}::${note}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    rows.push({ id, projectId, displayLabel, fullPath, note, openMode });
  }

  return rows;
}

function normalizeSkillCard(item: unknown, index: number): SkillCardView {
  const record = asRecord(item) ?? {};
  const name = asString(record.name, `skill-${index + 1}`);
  const description = asString(record.description, t('skills.noDescription'));
  const path = asString(record.path, t('skills.unknownLocation'));
  const displayPath = asString(record.displayPath, path);
  const fullPath = asString(record.fullPath, path);
  const openPath = asString(record.openPath, path);
  const locationKind = record.locationKind === 'dynamic-preset' ? 'dynamic-preset' : 'direct';
  const globalEnabled = asBoolean(record.globalEnabled, asBoolean(record.enabled, false));
  const updatedAt = asString(record.updatedAt) || null;

  const directProjects = toProjectIntersections(
    record.directProjects ?? record.directProjectIds ?? record.directProjectPaths ?? [],
    'project',
  );

  const viaPresetProjects = toProjectIntersections(
    record.viaPresetProjects ?? record.viaPresetProjectIds ?? record.viaPresetProjectPaths ?? [],
    'project-parent',
  );

  return {
    key: fullPath || path || name || `skill-${index + 1}`,
    name,
    description,
    path,
    displayPath,
    fullPath,
    openPath,
    locationKind,
    globalEnabled,
    updatedAt,
    directProjects,
    viaPresetProjects,
  };
}

function isFlipped(cardKey: string): boolean {
  return flippedCards.value.has(cardKey);
}

function isCardPending(cardKey: string): boolean {
  return pendingCardKeys.value.has(cardKey);
}

function setCardPending(cardKey: string, nextValue: boolean): void {
  const next = new Set(pendingCardKeys.value);
  if (nextValue) {
    next.add(cardKey);
  } else {
    next.delete(cardKey);
  }
  pendingCardKeys.value = next;
}

function isLocationPending(cardKey: string): boolean {
  return pendingLocationKeys.value.has(cardKey);
}

function setLocationPending(cardKey: string, nextValue: boolean): void {
  const next = new Set(pendingLocationKeys.value);
  if (nextValue) {
    next.add(cardKey);
  } else {
    next.delete(cardKey);
  }
  pendingLocationKeys.value = next;
}

function isProjectPending(projectKey: string): boolean {
  return pendingProjectKeys.value.has(projectKey);
}

function setProjectPending(projectKey: string, nextValue: boolean): void {
  const next = new Set(pendingProjectKeys.value);
  if (nextValue) {
    next.add(projectKey);
  } else {
    next.delete(projectKey);
  }
  pendingProjectKeys.value = next;
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

function replaceCards(nextCards: SkillCardView[]): void {
  cards.value = nextCards;
  const activeKeys = new Set(nextCards.map((card) => card.key));
  flippedCards.value = new Set([...flippedCards.value].filter((cardKey) => activeKeys.has(cardKey)));
  pendingCardKeys.value = new Set([...pendingCardKeys.value].filter((cardKey) => activeKeys.has(cardKey)));
  pendingLocationKeys.value = new Set([...pendingLocationKeys.value].filter((cardKey) => activeKeys.has(cardKey)));
  pendingProjectKeys.value = new Set([...pendingProjectKeys.value].filter((projectKey) => activeKeys.has(projectKey.split('::')[0] ?? '')));
}

function updateCardEnabled(cardKey: string, enabled: boolean): void {
  cards.value = cards.value.map((card) => (card.key === cardKey ? { ...card, globalEnabled: enabled } : card));
}

async function loadSkills(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  actionError.value = '';
  setQuickActions([]);

  try {
    const payload = await apiRequest<SkillsApiPayload>('/api/skills');
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.skills) ? payload.skills : [];
    replaceCards(items.map((item, index) => normalizeSkillCard(item, index)));
  } catch (error) {
    if (error instanceof ApiRequestError) {
      loadError.value = error.detail.message;
    } else {
      loadError.value = t('skills.loadFailed');
    }
  } finally {
    loading.value = false;
  }
}

async function toggleSkill(card: SkillCardView): Promise<void> {
  if (isCardPending(card.key)) {
    return;
  }

  actionError.value = '';
  setCardPending(card.key, true);

  const nextEnabled = !card.globalEnabled;
  updateCardEnabled(card.key, nextEnabled);

  try {
    const payload = nextEnabled
      ? await apiRequest<SkillsApiPayload>('/api/skills/global/enable', {
          method: 'POST',
          body: JSON.stringify({
            skillNames: [card.name],
          }),
        })
      : await apiRequest<SkillsApiPayload>('/api/skills/global/disable', {
          method: 'POST',
          body: JSON.stringify({
            skillNames: [card.name],
          }),
        });

    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.skills) ? payload.skills : [];
    replaceCards(items.map((item, index) => normalizeSkillCard(item, index)));
  } catch (error) {
    updateCardEnabled(card.key, card.globalEnabled);
    if (error instanceof ApiRequestError) {
      actionError.value = error.detail.message;
    } else {
      actionError.value = nextEnabled ? t('skills.enableFailed', { name: card.name }) : t('skills.disableFailed', { name: card.name });
    }
  } finally {
    setCardPending(card.key, false);
  }
}

async function openSkillLocation(card: SkillCardView): Promise<void> {
  if (isLocationPending(card.key)) {
    return;
  }

  actionError.value = '';
  setLocationPending(card.key, true);

  try {
    await apiRequest<{ message: string }>(`/api/skills/${encodeURIComponent(card.name)}/quick-open`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      actionError.value = error.detail.message;
    } else {
      actionError.value = t('projectDetail.openFailed');
    }
  } finally {
    setLocationPending(card.key, false);
  }
}

async function openProjectLocation(card: SkillCardView, project: ProjectIntersectionView): Promise<void> {
  const pendingKey = `${card.key}::${project.id}`;
  if (isProjectPending(pendingKey)) {
    return;
  }

  actionError.value = '';
  setProjectPending(pendingKey, true);

  const endpoint =
    project.openMode === 'project-parent'
      ? `/api/projects/${encodeURIComponent(project.projectId)}/parent-quick-open`
      : `/api/projects/${encodeURIComponent(project.projectId)}/quick-open`;

  try {
    await apiRequest<{ message: string }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      actionError.value = error.detail.message;
    } else {
      actionError.value = t('projectDetail.openFailed');
    }
  } finally {
    setProjectPending(pendingKey, false);
  }
}

onMounted(() => {
  void loadSkills();
});
</script>

<template>
  <section class="space-y-4">
    <header class="panel">
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
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
    <section v-else-if="loadError" class="panel border-red-200 bg-red-50 text-sm text-red-800">
      {{ loadError }}
    </section>
    <section v-else-if="cards.length === 0" class="panel text-sm text-ink/70">
      {{ t('skills.empty') }}
    </section>
    <section v-else-if="filteredCards.length === 0" class="panel text-sm text-ink/70">
      {{ t('skills.noMatch') }}
    </section>

    <section v-if="actionError" class="panel border-red-200 bg-red-50 text-sm text-red-800">
      {{ actionError }}
    </section>

    <ul v-if="!loading && !loadError && cards.length > 0 && filteredCards.length > 0" class="skills-grid">
      <li v-for="card in filteredCards" :key="card.key" class="skill-card-shell">
        <div class="skill-card-inner" :class="{ flipped: isFlipped(card.key) }">
          <article
            class="skill-face skill-face-front panel skill-face-clickable"
            role="button"
            tabindex="0"
            @click="toggleCard(card.key)"
            @keydown="onCardKeydown($event, card.key)"
          >
            <div class="skill-card-header">
              <div class="skill-card-header__main">
                <p class="field-label">{{ t('skills.summaryLabel') }}</p>
                <h4 class="mt-1 font-display text-2xl text-ink skill-card-title" :title="card.name">{{ card.name }}</h4>
              </div>
              <div class="skill-card-header__actions">
              <button
                type="button"
                class="skill-status-toggle"
                :class="{ 'skill-status-toggle--enabled': card.globalEnabled }"
                :aria-pressed="card.globalEnabled"
                :disabled="isCardPending(card.key)"
                @keydown.stop
                @click.stop="toggleSkill(card)"
              >
                {{ isCardPending(card.key) ? t('common.updating') : card.globalEnabled ? t('common.enabled') : t('common.disabled') }}
              </button>
              </div>
            </div>

            <p class="mt-3 text-sm text-ink/75 skills-description-clamp" :title="card.description">{{ card.description }}</p>

            <dl class="mt-4 grid gap-3 md:grid-cols-2">
              <div class="min-w-0">
                <dt class="field-label">{{ t('skills.location') }}</dt>
                <dd class="mt-1">
                  <button
                    type="button"
                    class="skill-location-button"
                    :data-open-path="card.openPath"
                    :data-location-kind="card.locationKind"
                    :title="card.fullPath"
                    :disabled="isLocationPending(card.key)"
                    @keydown.stop
                    @click.stop="openSkillLocation(card)"
                  >
                    <span class="skill-location-button__text">
                      {{ isLocationPending(card.key) ? t('common.opening') : card.displayPath }}
                    </span>
                  </button>
                </dd>
              </div>
              <div>
                <dt class="field-label">{{ t('skills.updated') }}</dt>
                <dd class="mt-1 text-sm text-ink/75">{{ formatDateTime(card.updatedAt) }}</dd>
              </div>
            </dl>
          </article>

          <article
            class="skill-face skill-face-back panel skill-face-clickable"
            role="button"
            tabindex="0"
            @click="toggleCard(card.key)"
            @keydown="onCardKeydown($event, card.key)"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="field-label">{{ t('skills.intersection') }}</p>
                <h4 class="mt-1 font-display text-2xl text-ink" :title="card.name">{{ card.name }}</h4>
              </div>
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
                    <button
                      type="button"
                      class="skill-related-project-button"
                      :title="project.fullPath"
                      :disabled="isProjectPending(`${card.key}::${project.id}`)"
                      @keydown.stop
                      @click.stop="openProjectLocation(card, project)"
                    >
                      {{ isProjectPending(`${card.key}::${project.id}`) ? t('common.opening') : project.displayLabel }}
                    </button>
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
                    <button
                      type="button"
                      class="skill-related-project-button"
                      :title="project.fullPath"
                      :disabled="isProjectPending(`${card.key}::${project.id}`)"
                      @keydown.stop
                      @click.stop="openProjectLocation(card, project)"
                    >
                      {{ isProjectPending(`${card.key}::${project.id}`) ? t('common.opening') : project.displayLabel }}
                    </button>
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
  min-height: clamp(21rem, 30vw, 24rem);
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 380ms ease;
}

.skill-card-inner.flipped {
  transform: rotateY(180deg);
}

.skill-face {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  backface-visibility: hidden;
}

.skill-face-clickable {
  cursor: pointer;
}

.skill-face-clickable:focus-visible {
  outline: 2px solid rgba(176, 93, 54, 0.5);
  outline-offset: 3px;
}

.skill-face-front {
  position: relative;
}

.skill-face-back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
  overflow: auto;
}

.skill-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.skill-card-header__main {
  min-width: 0;
  flex: 1;
}

.skill-card-header__actions {
  flex-shrink: 0;
}

.skill-card-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.skill-location-button {
  max-width: 100%;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(176, 93, 54, 0.96);
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: rgba(176, 93, 54, 0.28);
  text-underline-offset: 0.22rem;
}

.skill-location-button:hover:not(:disabled) {
  color: rgba(45, 38, 31, 0.86);
  text-decoration-color: rgba(176, 93, 54, 0.7);
}

.skill-location-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.skill-location-button__text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skill-related-project-button {
  display: inline-flex;
  max-width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: rgba(176, 93, 54, 0.22);
  text-underline-offset: 0.22rem;
}

.skill-related-project-button:hover:not(:disabled) {
  color: rgba(45, 38, 31, 0.92);
  text-decoration-color: rgba(176, 93, 54, 0.62);
}

.skill-related-project-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

@media (max-width: 767px), (prefers-reduced-motion: reduce) {
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
    display: flex;
  }
}
</style>
