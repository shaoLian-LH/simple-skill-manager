<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { ApiRequestError, apiRequest } from '../lib/api';
import { useSetQuickActions, useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';

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
  relationshipSummary: string[];
  totals: {
    projects: number;
    presets: number;
    skills: number;
  };
  recentProjects: ProjectSummary[];
}

const router = useRouter();
const setQuickActions = useSetQuickActions();
const { t, formatDateTime, withLocalePath } = useUiI18n();

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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toProjectSummary(entry: unknown): ProjectSummary | null {
  const record = toRecord(entry);
  if (!record) {
    return null;
  }

  const projectId = toString(record.projectId);
  const projectPath = toString(record.projectPath);
  if (!projectId || !projectPath) {
    return null;
  }

  return {
    projectId,
    projectPath,
    enabledSkillCount: toNumber(record.enabledSkillCount),
    enabledPresetCount: toNumber(record.enabledPresetCount),
    updatedAt: toString(record.updatedAt),
  };
}

function formatProjectName(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, '/');
  const tail = normalized.split('/').filter(Boolean).at(-1);
  return tail || projectPath;
}

function normalizeBoot(boot: BootPayload | null): { launchCwd: string; matchedProjectId: string | null } {
  const launchCwd = toString(boot?.launchCwd, '');
  const matchedProjectId = toString(boot?.matchedProjectId, '') || null;
  return { launchCwd, matchedProjectId };
}

function normalizeOverviewPayload(raw: unknown, boot: BootPayload | null): OverviewModel {
  const record = toRecord(raw) ?? {};
  const bootInfo = normalizeBoot(boot);

  const totalsRecord = toRecord(record.totals) ?? {};
  const totals = {
    projects: toNumber(totalsRecord.projects),
    presets: toNumber(totalsRecord.presets),
    skills: toNumber(totalsRecord.skills),
  };

  const recentProjects = Array.isArray(record.recentProjects)
    ? record.recentProjects.map((entry) => toProjectSummary(entry)).filter((entry): entry is ProjectSummary => entry !== null)
    : [];

  const matchedProjectRecord = toRecord(record.matchedProject);
  const matchedProjectId = toString(matchedProjectRecord?.projectId) || bootInfo.matchedProjectId;
  const matchedProjectPath = toString(matchedProjectRecord?.projectPath);
  const matchedProjectLabel =
    toString(matchedProjectRecord?.displayName) ||
    toString(matchedProjectRecord?.name) ||
    (matchedProjectPath ? formatProjectName(matchedProjectPath) : matchedProjectId || t('common.noMatch'));

  const primaryScopeRecord = toRecord(record.primaryScope);
  const primaryScope = toString(primaryScopeRecord?.label, matchedProjectId ? t('common.scopeProject') : t('common.scopeGlobal'));

  const recommendedActions = (Array.isArray(record.recommendedActions) ? record.recommendedActions : [])
    .map((entry, index) => {
      const item = toRecord(entry) ?? {};
      const to = toString(item.to) || toString(item.route);
      if (!to) {
        return null;
      }

      return {
        id: toString(item.id, `action-${index + 1}`),
        label: toString(item.label, t('common.open')),
        description: toString(item.description),
        to,
        primary: toString(item.emphasis, 'secondary') === 'primary' || Boolean(item.primary),
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

  const relationshipSummaryRecord = toRecord(record.relationshipSummary);
  const relationshipItems = Array.isArray(relationshipSummaryRecord?.items)
    ? relationshipSummaryRecord.items
    : Array.isArray(record.relationshipSummary)
      ? record.relationshipSummary
      : [];

  const relationshipSummary = relationshipItems
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }

      const item = toRecord(entry) ?? {};
      return toString(item.sentence);
    })
    .filter((entry) => entry.trim().length > 0);

  const fallbackRelationshipSummary = [
    t('facade.relationshipGlobalPresetsEmpty'),
    t('facade.relationshipProjects', { projects: totals.projects, count: 0 }),
    t('facade.relationshipRegistry', { presetCount: totals.presets, skillCount: totals.skills }),
  ];

  return {
    launchCwd: toString(record.launchCwd, bootInfo.launchCwd),
    matchedProjectLabel,
    matchedProjectId,
    primaryScope,
    nextAction: recommendedActions[0]?.description || primaryScopeRecord?.description?.toString() || '',
    recommendedActions: recommendedActions.length > 0 ? recommendedActions : fallbackActions,
    relationshipSummary: relationshipSummary.length > 0 ? relationshipSummary : fallbackRelationshipSummary,
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
    if (error instanceof ApiRequestError) {
      errorMessage.value = error.detail.message;
    } else {
      errorMessage.value = t('overview.loadFailed');
    }
  } finally {
    loading.value = false;
  }
}

function openAction(to: string): void {
  void router.push(withLocalePath(to));
}

function openProject(projectId: string): void {
  void router.push(withLocalePath(`/projects/${encodeURIComponent(projectId)}`));
}

onMounted(() => {
  void loadOverview();
});
</script>

<template>
  <section class="space-y-4">
    <section v-if="loading" class="panel text-sm text-ink/70">{{ t('overview.loading') }}</section>

    <section v-else-if="errorMessage" class="panel border-red-200 bg-red-50 text-sm text-red-800">
      <p>{{ errorMessage }}</p>
      <button type="button" class="btn-secondary mt-3" @click="loadOverview">{{ t('common.retry') }}</button>
    </section>

    <template v-else-if="model">
      <section class="panel">
        <div class="flex items-center justify-between">
          <p class="field-label">{{ t('overview.recommendedActions') }}</p>
          <p class="text-xs text-ink/60">{{ t('overview.actionsCount', { count: model.recommendedActions.length }) }}</p>
        </div>
        <ul class="mt-3 grid gap-3 md:grid-cols-3">
          <li v-for="action in model.recommendedActions.slice(0, 3)" :key="action.id" class="rounded-xl border border-ink/10 bg-white/70 p-3">
            <p class="font-semibold text-ink">{{ action.label }}</p>
            <p class="mt-1 text-sm text-ink/70">{{ action.description }}</p>
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

      <section class="panel">
        <p class="field-label">{{ t('overview.influenceSummary') }}</p>
        <ul class="mt-3 space-y-2">
          <li
            v-for="(line, index) in model.relationshipSummary"
            :key="`summary-${index}`"
            class="rounded-xl border border-ink/10 bg-paper/80 px-3 py-2 text-sm text-ink/80"
          >
            {{ line }}
          </li>
        </ul>
      </section>

      <section class="panel">
        <p class="field-label">{{ t('overview.secondarySnapshot') }}</p>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <article class="rounded-xl border border-ink/10 bg-white/70 p-3">
            <p class="text-xs uppercase tracking-[0.12em] text-ink/60">{{ t('nav.projects') }}</p>
            <p class="mt-1 text-2xl font-display text-ink">{{ model.totals.projects }}</p>
          </article>
          <article class="rounded-xl border border-ink/10 bg-white/70 p-3">
            <p class="text-xs uppercase tracking-[0.12em] text-ink/60">{{ t('nav.presets') }}</p>
            <p class="mt-1 text-2xl font-display text-ink">{{ model.totals.presets }}</p>
          </article>
          <article class="rounded-xl border border-ink/10 bg-white/70 p-3">
            <p class="text-xs uppercase tracking-[0.12em] text-ink/60">{{ t('nav.skills') }}</p>
            <p class="mt-1 text-2xl font-display text-ink">{{ model.totals.skills }}</p>
          </article>
        </div>

        <div class="mt-4">
          <div class="flex items-center justify-between">
            <p class="field-label">{{ t('overview.recentProjects') }}</p>
            <button type="button" class="btn-ghost" @click="openAction('/projects')">{{ t('common.viewAll') }}</button>
          </div>
          <ul v-if="model.recentProjects.length > 0" class="mt-2 space-y-2">
            <li
              v-for="project in model.recentProjects.slice(0, 5)"
              :key="project.projectId"
              class="rounded-xl border border-ink/10 bg-paper/80 p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-ink">{{ formatProjectName(project.projectPath) }}</p>
                  <p class="mt-1 break-all text-xs text-ink/70">{{ project.projectPath }}</p>
                  <p class="mt-1 text-xs text-ink/70">
                    {{
                      t('overview.skillPresetSummary', {
                        skillCount: project.enabledSkillCount,
                        presetCount: project.enabledPresetCount,
                      })
                    }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-xs text-ink/60">{{ formatDateTime(project.updatedAt) }}</p>
                  <button type="button" class="btn-ghost mt-2" @click="openProject(project.projectId)">
                    {{ t('common.open') }}
                  </button>
                </div>
              </div>
            </li>
          </ul>
          <p v-else class="mt-2 rounded-xl border border-dashed border-ink/20 p-3 text-sm text-ink/70">
            {{ t('overview.noTrackedProjects') }}
          </p>
        </div>
      </section>
    </template>
  </section>
</template>
