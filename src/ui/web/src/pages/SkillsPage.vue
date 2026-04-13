<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import PageSearchBar from '../components/PageSearchBar.vue';
import PageStatePanel from '../components/PageStatePanel.vue';
import SkillToggleSwitch from '../components/SkillToggleSwitch.vue';
import SwitchButtonCard from '../components/SwitchButtonCard.vue';
import { apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { asBoolean, asRecord, asString, asStringArray } from '../lib/coerce';
import { getLastPathSegment } from '../lib/format';
import { useUiI18n } from '../lib/i18n';
import { resolveRequestErrorMessage, usePendingSet } from '../lib/page';

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
const {
  isPending: isCardPending,
  resetPending: resetCardPending,
  setPending: setCardPending,
} = usePendingSet();
const {
  isPending: isLocationPending,
  resetPending: resetLocationPending,
  setPending: setLocationPending,
} = usePendingSet();
const {
  isPending: isProjectPending,
  resetPending: resetProjectPending,
  setPending: setProjectPending,
} = usePendingSet();

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
  scopeDescription: loadError.value || actionError.value || t('skills.description'),
}));

function onCardKeydown(event: KeyboardEvent, cardKey: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  toggleCard(cardKey);
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

function projectPathLabel(project: ProjectIntersectionView): string {
  return getLastPathSegment(project.fullPath) || project.displayLabel;
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
  resetCardPending();
  resetLocationPending();
  resetProjectPending();
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
    loadError.value = resolveRequestErrorMessage(error, t('skills.loadFailed'));
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
      ? await apiRequest<SkillsApiPayload>('/api/skills/global/on', {
          method: 'POST',
          body: JSON.stringify({
            skillNames: [card.name],
          }),
        })
      : await apiRequest<SkillsApiPayload>('/api/skills/global/off', {
          method: 'POST',
          body: JSON.stringify({
            skillNames: [card.name],
          }),
        });

    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.skills) ? payload.skills : [];
    replaceCards(items.map((item, index) => normalizeSkillCard(item, index)));
  } catch (error) {
    updateCardEnabled(card.key, card.globalEnabled);
    actionError.value = resolveRequestErrorMessage(
      error,
      nextEnabled ? t('skills.enableFailed', { name: card.name }) : t('skills.disableFailed', { name: card.name }),
    );
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
    actionError.value = resolveRequestErrorMessage(error, t('projectDetail.openFailed'));
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
    actionError.value = resolveRequestErrorMessage(error, t('projectDetail.openFailed'));
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
    <PageSearchBar
      id="skill-search"
      v-model="searchQuery"
      :label="t('common.search')"
      :placeholder="t('skills.searchPlaceholder')"
    />

    <PageStatePanel v-if="loading">{{ t('skills.loading') }}</PageStatePanel>
    <PageStatePanel v-else-if="loadError" tone="error">{{ loadError }}</PageStatePanel>
    <PageStatePanel v-else-if="cards.length === 0">{{ t('skills.empty') }}</PageStatePanel>
    <PageStatePanel v-else-if="filteredCards.length === 0">{{ t('skills.noMatch') }}</PageStatePanel>

    <PageStatePanel v-if="actionError" tone="error">{{ actionError }}</PageStatePanel>

    <ul v-if="!loading && !loadError && cards.length > 0 && filteredCards.length > 0" class="skills-grid">
      <li v-for="card in filteredCards" :key="card.key" class="skill-card-shell">
        <div class="skill-card-inner" :class="{ flipped: isFlipped(card.key) }">
          <SwitchButtonCard
            :title="card.name"
            class="skill-face skill-face-front skill-face-clickable"
            role="button"
            tabindex="0"
            @click="toggleCard(card.key)"
            @keydown="onCardKeydown($event, card.key)"
          >
            <template #switch>
              <SkillToggleSwitch
                :checked="card.globalEnabled"
                :aria-label="`${card.name}: ${card.globalEnabled ? t('common.disable') : t('common.enable')}`"
                :disabled="isCardPending(card.key)"
                :pending="isCardPending(card.key)"
                @toggle="toggleSkill(card)"
              />
            </template>

            <template #body>
              <p class="text-sm leading-6 text-muted skills-description-clamp" :title="card.description">{{ card.description }}</p>

              <dl class="grid gap-3 md:grid-cols-2">
                <div class="min-w-0">
                  <dt class="detail-term">{{ t('skills.location') }}</dt>
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
                  <dt class="detail-term">{{ t('skills.updated') }}</dt>
                  <dd class="mt-2 text-sm text-muted">{{ formatDateTime(card.updatedAt) }}</dd>
                </div>
              </dl>
            </template>
          </SwitchButtonCard>

          <article
            class="skill-face skill-face-back panel skill-face-clickable"
            role="button"
            tabindex="0"
            @click="toggleCard(card.key)"
            @keydown="onCardKeydown($event, card.key)"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h4 class="font-display text-2xl text-charcoal" :title="card.name">{{ card.name }}</h4>
              </div>
            </div>

            <div class="skill-back-list-grid">
              <section class="skill-back-section">
                <h5 class="subsection-heading">{{ t('skills.directProjects') }}</h5>
                <ul v-if="card.directProjects.length > 0" class="skill-back-section__scroller" @click.stop>
                  <li
                    v-for="project in card.directProjects"
                    :key="`direct-${card.key}-${project.id}`"
                    class="skill-project-row"
                  >
                    <button
                      type="button"
                      class="skill-related-project-button"
                      :title="project.fullPath"
                      :disabled="isProjectPending(`${card.key}::${project.id}`)"
                      @keydown.stop
                      @click.stop="openProjectLocation(card, project)"
                    >
                      {{ isProjectPending(`${card.key}::${project.id}`) ? t('common.opening') : projectPathLabel(project) }}
                    </button>
                  </li>
                </ul>
                <p v-else class="mt-2 text-sm text-muted">
                  {{ t('skills.noDirectProjects') }}
                </p>
              </section>

              <section class="skill-back-section">
                <h5 class="subsection-heading">{{ t('common.viaPreset') }}</h5>
                <ul v-if="card.viaPresetProjects.length > 0" class="skill-back-section__scroller" @click.stop>
                  <li
                    v-for="project in card.viaPresetProjects"
                    :key="`preset-${card.key}-${project.id}`"
                    class="skill-project-row"
                  >
                    <button
                      type="button"
                      class="skill-related-project-button"
                      :title="project.fullPath"
                      :disabled="isProjectPending(`${card.key}::${project.id}`)"
                      @keydown.stop
                      @click.stop="openProjectLocation(card, project)"
                    >
                      {{ isProjectPending(`${card.key}::${project.id}`) ? t('common.opening') : projectPathLabel(project) }}
                    </button>
                    <p v-if="project.note" class="skill-project-row__note">{{ project.note }}</p>
                  </li>
                </ul>
                <p v-else class="mt-2 text-sm text-muted">
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
  min-height: 200px;
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
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px,
    0 0 0 4px rgba(59, 130, 246, 0.16);
}

.skill-face-back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
  overflow: hidden;
  gap: 1rem;
}

.skill-location-button {
  max-width: 100%;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #0099ff;
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: rgba(0, 153, 255, 0.35);
  text-underline-offset: 0.22rem;
}

.skill-location-button:hover:not(:disabled) {
  color: #111111;
  text-decoration-color: rgba(0, 153, 255, 0.9);
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

.skill-back-list-grid {
  display: grid;
  flex: 1;
  min-height: 0;
  gap: 0.875rem;
  margin-top: 1rem;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.skill-back-section {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 0;
}

.skill-back-section__scroller {
  margin-top: 0.625rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  border-top: 1px solid rgba(34, 42, 53, 0.08);
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
}

.skill-back-section__scroller::-webkit-scrollbar {
  display: none;
}

.skill-project-row {
  padding: 0.75rem 0;
  color: #242424;
  border-bottom: 1px solid rgba(34, 42, 53, 0.08);
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
  text-decoration-color: rgba(0, 153, 255, 0.3);
  text-underline-offset: 0.22rem;
}

.skill-project-row__note {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: #6b7280;
}

.skill-related-project-button:hover:not(:disabled) {
  color: #111111;
  text-decoration-color: rgba(0, 153, 255, 0.9);
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
