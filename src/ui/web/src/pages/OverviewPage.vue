<script setup lang="ts">
import { onMounted, ref } from 'vue';

import PageStatePanel from '../components/PageStatePanel.vue';
import { apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { asNumber, asRecord, asString } from '../lib/coerce';
import { getProjectLabel } from '../lib/format';
import { useUiI18n } from '../lib/i18n';
import { useLocalizedNavigation } from '../lib/navigation';
import { resolveRequestErrorMessage } from '../lib/page';

interface BootPayload {
  launchCwd?: unknown;
  matchedProjectId?: unknown;
}

interface ProjectSummary {
  projectId: string;
  projectPath: string;
  enabledSkillCount: number;
  enabledPresetCount: number;
  updatedAt: string;
}

interface ActionItem {
  id: string;
  label: string;
  description: string;
  to: string;
  primary: boolean;
}

interface OverviewModel {
  launchCwd: string;
  matchedProjectLabel: string;
  matchedProjectId: string | null;
  primaryScope: string;
  nextAction: string;
  recommendedActions: ActionItem[];
  totals: {
    projects: number;
    presets: number;
    skills: number;
  };
  recentProjects: ProjectSummary[];
}

const setQuickActions = useSetQuickActions();
const { t, formatDateTime } = useUiI18n();
const { pushPath } = useLocalizedNavigation();

const loading = ref(true);
const errorMessage = ref('');
const model = ref<OverviewModel | null>(null);

useWorkspaceSpine(() => ({
  scopeLabel: model.value?.primaryScope ?? t('nav.overview'),
  scopeDescription: errorMessage.value
    ? errorMessage.value
    : model.value?.matchedProjectId
      ? `${model.value.matchedProjectLabel} · ${model.value.nextAction}`
      : model.value?.nextAction || t('app.routeDesc.overview'),
}));

function toProjectSummary(entry: unknown): ProjectSummary | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const projectId = asString(record.projectId);
  const projectPath = asString(record.projectPath);
  if (!projectId || !projectPath) {
    return null;
  }

  return {
    projectId,
    projectPath,
    enabledSkillCount: asNumber(record.enabledSkillCount),
    enabledPresetCount: asNumber(record.enabledPresetCount),
    updatedAt: asString(record.updatedAt),
  };
}

function normalizeBoot(boot: BootPayload | null): { launchCwd: string; matchedProjectId: string | null } {
  const launchCwd = asString(boot?.launchCwd, '');
  const matchedProjectId = asString(boot?.matchedProjectId, '') || null;
  return { launchCwd, matchedProjectId };
}

function normalizeOverviewPayload(raw: unknown, boot: BootPayload | null): OverviewModel {
  const record = asRecord(raw) ?? {};
  const bootInfo = normalizeBoot(boot);

  const totalsRecord = asRecord(record.totals) ?? {};
  const totals = {
    projects: asNumber(totalsRecord.projects),
    presets: asNumber(totalsRecord.presets),
    skills: asNumber(totalsRecord.skills),
  };

  const recentProjects = Array.isArray(record.recentProjects)
    ? record.recentProjects.map((entry) => toProjectSummary(entry)).filter((entry): entry is ProjectSummary => entry !== null)
    : [];

  const matchedProjectRecord = asRecord(record.matchedProject);
  const matchedProjectId = asString(matchedProjectRecord?.projectId) || bootInfo.matchedProjectId;
  const matchedProjectPath = asString(matchedProjectRecord?.projectPath);
  const matchedProjectLabel =
    asString(matchedProjectRecord?.displayName) ||
    asString(matchedProjectRecord?.name) ||
    (matchedProjectPath ? getProjectLabel(matchedProjectPath) : matchedProjectId || t('common.noMatch'));

  const primaryScopeRecord = asRecord(record.primaryScope);
  const primaryScope = asString(primaryScopeRecord?.label, matchedProjectId ? t('common.scopeProject') : t('common.scopeGlobal'));

  const recommendedActions = (Array.isArray(record.recommendedActions) ? record.recommendedActions : [])
    .map((entry, index) => {
      const item = asRecord(entry) ?? {};
      const to = asString(item.to) || asString(item.route);
      if (!to) {
        return null;
      }

      return {
        id: asString(item.id, `action-${index + 1}`),
        label: asString(item.label, t('common.open')),
        description: asString(item.description),
        to,
        primary: asString(item.emphasis, 'secondary') === 'primary' || Boolean(item.primary),
      } satisfies ActionItem;
    })
    .filter((entry): entry is ActionItem => entry !== null)
    .slice(0, 3);

  const fallbackActions: ActionItem[] = matchedProjectId
    ? [
        {
          id: 'open-matched-project',
          label: t('facade.actionAdjustMatchedProject'),
          description: t('facade.actionAdjustMatchedProjectDesc'),
          to: `/projects/${encodeURIComponent(matchedProjectId)}`,
          primary: true,
        },
        {
          id: 'open-project-index',
          label: t('facade.actionReviewOtherProjects'),
          description: t('facade.actionReviewOtherProjectsDesc'),
          to: '/projects',
          primary: false,
        },
        {
          id: 'open-presets',
          label: t('facade.actionGovernPresets'),
          description: t('facade.actionGovernPresetsDesc'),
          to: '/presets',
          primary: false,
        },
      ]
    : [
        {
          id: 'review-project-index',
          label: t('facade.actionReviewTrackedProjects'),
          description: t('facade.actionReviewTrackedProjectsDesc'),
          to: '/projects',
          primary: true,
        },
        {
          id: 'open-presets',
          label: t('facade.actionGovernPresets'),
          description: t('facade.actionGovernPresetsDesc'),
          to: '/presets',
          primary: false,
        },
        {
          id: 'open-config',
          label: t('facade.actionCheckGlobalBaseline'),
          description: t('facade.actionCheckGlobalBaselineDesc'),
          to: '/config',
          primary: false,
        },
      ];

  return {
    launchCwd: asString(record.launchCwd, bootInfo.launchCwd),
    matchedProjectLabel,
    matchedProjectId,
    primaryScope,
    nextAction: recommendedActions[0]?.description || primaryScopeRecord?.description?.toString() || '',
    recommendedActions: recommendedActions.length > 0 ? recommendedActions : fallbackActions,
    totals,
    recentProjects,
  };
}

async function loadOverview(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  setQuickActions([]);

  try {
    const boot = await apiRequest<BootPayload>('/api/boot');
    const overviewPayload = await apiRequest<unknown>('/api/overview');
    model.value = normalizeOverviewPayload(overviewPayload, boot);
  } catch (error) {
    errorMessage.value = resolveRequestErrorMessage(error, t('overview.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function openAction(to: string): void {
  void pushPath(to);
}

function openProject(projectId: string): void {
  void pushPath(`/projects/${encodeURIComponent(projectId)}`);
}

function onProjectCardKeydown(event: KeyboardEvent, currentProjectId: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  openProject(currentProjectId);
}

onMounted(() => {
  void loadOverview();
});
</script>

<template>
  <section class="space-y-4">
    <PageStatePanel v-if="loading">{{ t('overview.loading') }}</PageStatePanel>

    <PageStatePanel v-else-if="errorMessage" tone="error">
      <p>{{ errorMessage }}</p>
      <template #actions>
        <button type="button" class="btn-secondary" @click="loadOverview">{{ t('common.retry') }}</button>
      </template>
    </PageStatePanel>

    <template v-else-if="model">
      <section class="space-y-3">
        <h3 class="section-heading">{{ t('overview.globalOverview') }}</h3>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <article class="metric-card overview-metric-card">
            <p class="metric-label">{{ t('nav.projects') }}</p>
            <p class="metric-value">{{ model.totals.projects }}</p>
          </article>
          <article class="metric-card overview-metric-card">
            <p class="metric-label">{{ t('nav.presets') }}</p>
            <p class="metric-value">{{ model.totals.presets }}</p>
          </article>
          <article class="metric-card overview-metric-card">
            <p class="metric-label">{{ t('nav.skills') }}</p>
            <p class="metric-value">{{ model.totals.skills }}</p>
          </article>
        </div>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="section-heading">{{ t('overview.recentProjects') }}</h3>
          <button type="button" class="btn-ghost" @click="openAction('/projects')">{{ t('common.viewAll') }}</button>
        </div>
        <ul v-if="model.recentProjects.length > 0" class="recent-project-grid">
          <li
            v-for="project in model.recentProjects.slice(0, 6)"
            :key="project.projectId"
            class="recent-project-card"
            role="button"
            tabindex="0"
            @click="openProject(project.projectId)"
            @keydown="onProjectCardKeydown($event, project.projectId)"
          >
            <div class="recent-project-card__body">
              <div class="recent-project-card__header min-w-0">
                <h4 class="recent-project-card__title font-display text-2xl text-charcoal" :title="getProjectLabel(project.projectPath)">
                  {{ getProjectLabel(project.projectPath) }}
                </h4>
                <p class="recent-project-card__path mt-3 text-sm leading-6 text-muted" :title="project.projectPath">
                  {{ project.projectPath }}
                </p>
              </div>
            </div>
            <div class="recent-project-card__footer">
              <div class="recent-project-card__summary">
                <div class="recent-project-card__summary-item">
                  <p class="detail-term">{{ t('nav.skills') }}</p>
                  <p class="recent-project-card__summary-value">{{ project.enabledSkillCount }}</p>
                </div>
                <div class="recent-project-card__summary-item">
                  <p class="detail-term">{{ t('nav.presets') }}</p>
                  <p class="recent-project-card__summary-value">{{ project.enabledPresetCount }}</p>
                </div>
              </div>
              <div class="recent-project-card__footer-meta">
                <p class="detail-term">{{ t('skills.updated') }}</p>
                <p class="recent-project-card__footer-value text-sm text-muted">{{ formatDateTime(project.updatedAt) }}</p>
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="rounded-card bg-subtle p-4 text-sm text-muted shadow-card">
          {{ t('overview.noTrackedProjects') }}
        </p>
      </section>

      <section class="space-y-3">
        <h3 class="section-heading">{{ t('overview.recommendedActions') }}</h3>
        <ul class="overview-action-grid">
          <li v-for="action in model.recommendedActions.slice(0, 3)" :key="action.id" class="overview-action-card">
            <p class="font-semibold text-charcoal">{{ action.label }}</p>
            <p class="mt-2 text-sm leading-6 text-muted">{{ action.description }}</p>
            <button
              type="button"
              :class="action.primary ? 'btn-primary mt-3' : 'btn-secondary mt-3'"
              @click="openAction(action.to)"
            >
              {{ t('common.open') }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.overview-metric-card {
  background: #ffffff;
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px,
    rgba(34, 42, 53, 0.05) 0px 4px 8px 0px;
}

.recent-project-grid {
  display: grid;
  gap: 1rem;
}

.recent-project-card {
  border-radius: 1.25rem;
  background: #ffffff;
  box-shadow:
    rgba(19, 19, 22, 0.72) 0px 1px 6px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px,
    rgba(34, 42, 53, 0.08) 0px 18px 36px -18px;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 1.5rem;
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.recent-project-card:hover {
  background: #ffffff;
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.1) 0px 0px 0px 1px,
    rgba(34, 42, 53, 0.1) 0px 20px 40px -20px;
  transform: translateY(-2px);
}

.recent-project-card:active {
  transform: translateY(-1px);
}

.recent-project-card:focus-visible {
  box-shadow:
    rgba(19, 19, 22, 0.7) 0px 1px 5px -4px,
    rgba(34, 42, 53, 0.08) 0px 0px 0px 1px,
    0 0 0 4px rgba(59, 130, 246, 0.16);
}

.recent-project-card__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
}

.recent-project-card__header {
  min-width: 0;
}

.recent-project-card__title {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.12;
}

.recent-project-card__footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.recent-project-card__footer-meta {
  min-width: 0;
  flex-shrink: 0;
  text-align: right;
}

.recent-project-card__path {
  display: -webkit-box;
  min-height: calc(1.5rem * 3);
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.recent-project-card__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
  flex: 1;
  gap: 0.75rem;
}

.recent-project-card__summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.recent-project-card__summary-value {
  font-family:
    "Avenir Next",
    "Inter",
    "Segoe UI",
    ui-sans-serif,
    system-ui,
    sans-serif;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.2;
  color: #242424;
}

.recent-project-card__footer-value {
  margin-top: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 639px) {
  .recent-project-card__footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .recent-project-card__footer-meta {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .recent-project-card {
    transition: box-shadow 160ms ease;
  }

  .recent-project-card:hover,
  .recent-project-card:active {
    transform: none;
  }
}

@media (min-width: 640px) {
  .recent-project-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 768px) {
  .recent-project-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
