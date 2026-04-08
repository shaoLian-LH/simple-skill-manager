import fs from 'node:fs/promises';
import path from 'node:path';

import { disablePresets, disableSkills, enablePresets, enableSkills } from '../../core/activation/service.js';
import { loadConfig, updateConfig } from '../../core/config/service.js';
import { SkmError } from '../../core/errors.js';
import { loadProjectsIndex } from '../../core/project/projects-index.js';
import {
  addPresetDefinition,
  deletePresetDefinition,
  findPresetReferences,
  getPresetDefinitionByName,
  listPresetDefinitions,
  updatePresetDefinition,
} from '../../core/registry/presets.js';
import { getSkillByName, listSkills } from '../../core/registry/skills.js';
import { loadGlobalState } from '../../core/state/global-state.js';
import { loadProjectState } from '../../core/state/project-state.js';
import { SUPPORTED_TARGETS, type PresetDefinition, type ProjectIndexEntry, type SkillDefinition, type TargetName } from '../../core/types.js';
import type {
  BootView,
  ConfigView,
  DashboardView,
  EnabledPresetView,
  FolderPickView,
  LaunchStatusView,
  MatchedProjectView,
  OverviewView,
  PresetDeletePreviewView,
  PresetDeleteView,
  PresetDetailView,
  PresetsView,
  ProjectDetailView,
  ProjectPresetControlView,
  ProjectReferenceView,
  ProjectSkillControlView,
  ProjectSummaryView,
  QuickActionView,
  QuickOpenView,
  RelationshipSummaryItemView,
  ResolvedSkillSourceView,
  ResolvedSkillView,
  SkillIntersectionProjectView,
  SkillsView,
} from '../contracts/api.js';
import { UiValidationError } from '../server/errors.js';
import { isNativeFolderPickerSupported, pickSkillsDirectory as pickNativeSkillsDirectory, type FolderPickView as FolderPickResult } from '../system/folder-picker.js';
import { quickOpenPath as quickOpenSystemPath } from '../system/quick-open.js';
import { DEFAULT_UI_LOCALE, translateUiText, type UiLocale } from '../text.js';
import { decodeProjectId, encodeProjectId } from './project-id.js';

interface PresetReferenceIndex {
  byPreset: Map<string, string[]>;
}

interface MatchedProjectRecord {
  projectPath: string;
  entry: ProjectIndexEntry;
}

export interface UiFacadeDependencies {
  openProjectPath?: (projectPath: string, locale?: UiLocale) => Promise<QuickOpenView>;
  pickFolderPath?: (locale?: UiLocale) => Promise<FolderPickResult>;
  isFolderPickerAvailable?: () => boolean;
}

function t(locale: UiLocale, key: string, params?: Record<string, string | number>): string {
  return translateUiText(locale, key, params);
}

function sortStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function getProjectDisplayName(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? projectPath;
}

function createProjectReference(projectPath: string): ProjectReferenceView {
  return {
    projectId: encodeProjectId(projectPath),
    projectPath,
    displayName: getProjectDisplayName(projectPath),
  };
}

function normalizeDisplayPath(targetPath: string, segmentCount = 2): string {
  const normalized = targetPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    return targetPath;
  }

  return segments.slice(-Math.max(segmentCount, 1)).join('/');
}

function toSkillLocationKind(skill: SkillDefinition): 'direct' | 'dynamic-preset' {
  return skill.scopeName ? 'dynamic-preset' : 'direct';
}

function getSkillOpenPath(skill: SkillDefinition): string {
  return skill.scopeName ? path.dirname(path.dirname(skill.dirPath)) : path.dirname(skill.dirPath);
}

function toProjectSummary(projectPath: string, entry: ProjectIndexEntry): ProjectSummaryView {
  return {
    ...createProjectReference(projectPath),
    targets: [...entry.targets],
    enabledSkillCount: entry.enabledSkills.length,
    enabledPresetCount: entry.enabledPresets.length,
    updatedAt: entry.updatedAt,
  };
}

function toMatchedProjectView(projectPath: string, entry: ProjectIndexEntry): MatchedProjectView {
  return {
    ...toProjectSummary(projectPath, entry),
    matched: true,
  };
}

function buildGlobalQuickActions(locale: UiLocale): QuickActionView[] {
  return [
    {
      id: 'config-get',
      label: t(locale, 'facade.viewGlobalConfig'),
      command: 'skm config get',
    },
    {
      id: 'preset-list',
      label: t(locale, 'facade.listPresets'),
      command: 'skm preset list',
    },
    {
      id: 'skill-list',
      label: t(locale, 'facade.listSkills'),
      command: 'skm skill list',
    },
  ];
}

function buildConfigQuickActions(locale: UiLocale): QuickActionView[] {
  return [
    {
      id: 'config-get',
      label: t(locale, 'facade.inspectCurrentConfig'),
      command: 'skm config get',
    },
    {
      id: 'config-set-skills-dir',
      label: t(locale, 'facade.setSkillsDirectory'),
      command: 'skm config set skills-dir <path>',
    },
  ];
}

function buildPresetsQuickActions(locale: UiLocale): QuickActionView[] {
  return [
    {
      id: 'preset-list',
      label: t(locale, 'facade.listPresets'),
      command: 'skm preset list',
    },
    {
      id: 'preset-create',
      label: t(locale, 'facade.createPreset'),
      command: 'skm preset create <name> <skill...>',
    },
    {
      id: 'preset-update',
      label: t(locale, 'facade.updatePreset'),
      command: 'skm preset update <name> <skill...>',
    },
  ];
}

function buildProjectQuickActions(projectPath: string, locale: UiLocale): QuickActionView[] {
  return [
    {
      id: 'doctor',
      label: t(locale, 'facade.doctorProject'),
      command: `cd ${JSON.stringify(projectPath)} && skm doctor`,
    },
    {
      id: 'sync',
      label: t(locale, 'facade.syncProject'),
      command: `cd ${JSON.stringify(projectPath)} && skm sync`,
    },
    {
      id: 'quick-open',
      label: t(locale, 'facade.openProjectDirectory'),
      command: `code ${JSON.stringify(projectPath)}`,
    },
  ];
}

function buildPresetReferenceIndex(projects: Record<string, ProjectIndexEntry>): PresetReferenceIndex {
  const byPreset = new Map<string, string[]>();
  for (const [projectPath, entry] of Object.entries(projects)) {
    for (const presetName of entry.enabledPresets) {
      const existing = byPreset.get(presetName) ?? [];
      existing.push(projectPath);
      byPreset.set(presetName, existing);
    }
  }

  for (const [name, projectPaths] of byPreset.entries()) {
    byPreset.set(name, sortStrings(projectPaths));
  }

  return { byPreset };
}

function toEnabledPresetView(name: string, metadata: PresetDefinition | undefined): EnabledPresetView {
  return {
    name,
    skills: sortStrings(new Set(metadata?.skills ?? [])),
    source: metadata?.source ?? 'static',
    readonly: metadata?.readonly ?? false,
  };
}

function requireStringArray(name: string, value: unknown, locale: UiLocale = DEFAULT_UI_LOCALE): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new UiValidationError('usage', t(locale, 'facade.stringArrayMustBe', { name }), {
      hint: t(locale, 'facade.stringArrayHint', { name }),
      fieldErrors: {
        [name]: t(locale, 'facade.stringArrayField', { name }),
      },
    });
  }

  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function toConfigView(
  config: Awaited<ReturnType<typeof updateConfig>> | Awaited<ReturnType<typeof loadConfig>>['config'],
  paths: Awaited<ReturnType<typeof loadConfig>>['paths'],
  folderPickerSupported: boolean,
  locale: UiLocale = DEFAULT_UI_LOCALE,
): ConfigView {
  return {
    skillsDir: config.skillsDir,
    defaultTargets: [...config.defaultTargets],
    supportedTargets: [...SUPPORTED_TARGETS],
    quickActions: buildConfigQuickActions(locale),
    paths: {
      configFile: paths.configFile,
      presetsFile: paths.presetsFile,
      projectsFile: paths.projectsFile,
    },
    folderPicker: {
      supported: folderPickerSupported,
      mode: folderPickerSupported ? 'host' : 'manual-only',
    },
  };
}

function requireObjectPayload(payload: unknown, message: string, hint: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) {
    throw new UiValidationError('usage', message, {
      hint,
    });
  }

  return payload as Record<string, unknown>;
}

function extractMatch(message: string, pattern: RegExp): string | null {
  const match = message.match(pattern);
  return match?.[1] ?? null;
}

function mapPresetRegistryError(error: unknown, locale: UiLocale): never {
  if (!(error instanceof SkmError)) {
    throw error;
  }

  const readonlyPresetName = extractMatch(error.message, /^Preset (.+) is a dynamic scope preset and cannot be modified\.$/);
  if (readonlyPresetName) {
    throw new UiValidationError('conflict', t(locale, 'facade.presetReadonlyMutation', { name: readonlyPresetName }), {
      hint: t(locale, 'facade.presetReadonlyMutationHint'),
      cause: error,
    });
  }

  const missingPresetName = extractMatch(error.message, /^Preset (.+) was not found\.$/);
  if (missingPresetName) {
    throw new SkmError('config', t(locale, 'facade.presetNotFound', { name: missingPresetName }), {
      hint: t(locale, 'facade.presetNotFoundHint'),
      cause: error,
    });
  }

  if (error.message === 'Preset skills cannot be empty.') {
    throw new UiValidationError('usage', t(locale, 'facade.presetSkillsRequired'), {
      hint: t(locale, 'facade.presetSkillsRequiredHint'),
      fieldErrors: {
        skills: t(locale, 'facade.stringArrayField', { name: 'skills' }),
      },
      cause: error,
    });
  }

  const unknownSkillNames = extractMatch(error.message, /^Preset references unknown skill\(s\): (.+)\.$/);
  if (unknownSkillNames) {
    throw new SkmError('config', t(locale, 'facade.presetUnknownSkills', { names: unknownSkillNames }), {
      details: error.details,
      hint: t(locale, 'facade.presetUnknownSkillsHint'),
      cause: error,
    });
  }

  throw error;
}

function mapConfigError(error: unknown, body: { skillsDir?: unknown; defaultTargets?: unknown }, locale: UiLocale): never {
  if (!(error instanceof SkmError)) {
    throw error;
  }

  const fieldErrors: Record<string, string> = {};
  let message = error.message;
  let hint = error.hint;

  const missingSkillsDir = extractMatch(error.message, /^Skills directory does not exist: (.+)\.$/);
  if (missingSkillsDir) {
    message = t(locale, 'facade.skillsDirMissing', { path: missingSkillsDir });
    hint = t(locale, 'facade.skillsDirInvalidHint');
  }

  const nonDirectorySkillsDir = extractMatch(error.message, /^Skills directory is not a directory: (.+)\.$/);
  if (nonDirectorySkillsDir) {
    message = t(locale, 'facade.skillsDirNotDirectory', { path: nonDirectorySkillsDir });
    hint = t(locale, 'facade.skillsDirInvalidHint');
  }

  if (body.skillsDir !== undefined && error.message.includes('Skills directory')) {
    fieldErrors.skillsDir = message;
  }
  if (body.defaultTargets !== undefined && error.message.includes('target')) {
    fieldErrors.defaultTargets = message;
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new UiValidationError(error.kind === 'runtime' ? 'config' : error.kind, message, {
      details: error.details,
      hint,
      fieldErrors,
      cause: error,
    });
  }

  throw error;
}

async function resolveRealPath(candidate: string): Promise<string> {
  return fs.realpath(path.resolve(candidate)).catch(() => path.resolve(candidate));
}

function isPathInside(candidatePath: string, projectPath: string): boolean {
  const relative = path.relative(projectPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function findMatchedProjectRecord(
  launchCwd: string,
  projects: Record<string, ProjectIndexEntry>,
): Promise<MatchedProjectRecord | null> {
  const resolvedLaunchPath = await resolveRealPath(launchCwd);
  let bestMatch: MatchedProjectRecord | null = null;
  let bestLength = -1;

  for (const [projectPath, entry] of Object.entries(projects)) {
    const resolvedProjectPath = await resolveRealPath(projectPath);
    if (!isPathInside(resolvedLaunchPath, resolvedProjectPath)) {
      continue;
    }

    if (resolvedProjectPath.length > bestLength) {
      bestMatch = { projectPath, entry };
      bestLength = resolvedProjectPath.length;
    }
  }

  return bestMatch;
}

async function getSkillUpdatedAt(skillFilePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(skillFilePath);
    return stat.mtime.toISOString();
  } catch {
    return undefined;
  }
}

function buildRelationshipSummaryItems(input: {
  globalEnabledPresets: string[];
  globalEnabledSkills: string[];
  trackedProjects: number;
  presetDefinitions: PresetDefinition[];
  totalDirectAssignments: number;
}, locale: UiLocale): RelationshipSummaryItemView[] {
  return [
    {
      id: 'global-presets',
      sentence:
        input.globalEnabledPresets.length > 0
          ? t(locale, 'facade.relationshipGlobalPresetsActive', { count: input.globalEnabledPresets.length })
          : t(locale, 'facade.relationshipGlobalPresetsEmpty'),
      emphasis: input.globalEnabledPresets.join(', ') || undefined,
    },
    {
      id: 'projects',
      sentence: t(locale, 'facade.relationshipProjects', {
        projects: input.trackedProjects,
        count: input.totalDirectAssignments,
      }),
    },
    {
      id: 'registry',
      sentence: t(locale, 'facade.relationshipRegistry', {
        presetCount: input.presetDefinitions.length,
        skillCount: input.globalEnabledSkills.length,
      }),
      emphasis: input.globalEnabledSkills.join(', ') || undefined,
    },
  ];
}

export class UiFacade {
  private readonly openProjectPath: (projectPath: string, locale?: UiLocale) => Promise<QuickOpenView>;
  private readonly pickFolderPath: (locale?: UiLocale) => Promise<FolderPickResult>;
  private readonly isFolderPickerAvailable: () => boolean;

  constructor(deps: UiFacadeDependencies = {}) {
    this.openProjectPath =
      deps.openProjectPath ??
      ((projectPath, locale) => quickOpenSystemPath(projectPath, undefined, locale));
    this.pickFolderPath =
      deps.pickFolderPath ??
      ((locale = DEFAULT_UI_LOCALE) => pickNativeSkillsDirectory({ locale }));
    this.isFolderPickerAvailable = deps.isFolderPickerAvailable ?? (() => isNativeFolderPickerSupported());
  }

  async getDashboard(locale: UiLocale = DEFAULT_UI_LOCALE): Promise<DashboardView> {
    const overview = await this.getOverview(process.cwd(), locale);
    return {
      totals: {
        projects: overview.totals.projects,
        presets: overview.totals.presets,
        skills: overview.totals.skills,
      },
      recentProjects: overview.recentProjects,
      quickActions: buildGlobalQuickActions(locale),
    };
  }

  async getOverview(launchCwd: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<OverviewView> {
    const [{ config }, presetDefinitions, projectsIndex, skills, globalState] = await Promise.all([
      loadConfig(),
      listPresetDefinitions(),
      loadConfig().then(({ paths }) => loadProjectsIndex(paths.projectsFile)),
      loadConfig().then(({ config: loadedConfig }) => listSkills(loadedConfig.skillsDir)),
      loadConfig().then(({ paths }) => loadGlobalState(paths)),
    ]);

    void config;

    const matchedRecord = await findMatchedProjectRecord(launchCwd, projectsIndex.projects);
    const projects = (Object.entries(projectsIndex.projects) as Array<[string, ProjectIndexEntry]>)
      .map(([projectPath, entry]) => toProjectSummary(projectPath, entry))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    const globalEnabledSkills = sortStrings(new Set(globalState?.enabledSkills ?? []));
    const globalEnabledPresets = sortStrings(new Set(globalState?.enabledPresets ?? []));
    const totalDirectAssignments = Object.values(projectsIndex.projects).reduce((count, entry) => count + entry.enabledSkills.length, 0);

    return {
      launchCwd: await resolveRealPath(launchCwd),
      matchedProject: matchedRecord ? toMatchedProjectView(matchedRecord.projectPath, matchedRecord.entry) : null,
      primaryScope: matchedRecord
        ? {
            kind: 'project',
            label: t(locale, 'facade.projectScopeFirst'),
            description: t(locale, 'facade.projectScopeDescription', {
              name: getProjectDisplayName(matchedRecord.projectPath),
            }),
          }
        : {
            kind: 'global',
            label: t(locale, 'facade.globalScopeFirst'),
            description: t(locale, 'facade.globalScopeDescription'),
          },
      recommendedActions: matchedRecord
        ? [
            {
              id: 'matched-project',
              label: t(locale, 'facade.actionAdjustMatchedProject'),
              description: t(locale, 'facade.actionAdjustMatchedProjectDesc'),
              to: `/projects/${encodeURIComponent(encodeProjectId(matchedRecord.projectPath))}`,
              emphasis: 'primary',
            },
            {
              id: 'scan-projects',
              label: t(locale, 'facade.actionReviewOtherProjects'),
              description: t(locale, 'facade.actionReviewOtherProjectsDesc'),
              to: '/projects',
              emphasis: 'secondary',
            },
            {
              id: 'review-skills',
              label: t(locale, 'facade.actionInspectGlobalSkills'),
              description: t(locale, 'facade.actionInspectGlobalSkillsDesc'),
              to: '/skills',
              emphasis: 'secondary',
            },
          ]
        : [
            {
              id: 'review-projects',
              label: t(locale, 'facade.actionReviewTrackedProjects'),
              description: t(locale, 'facade.actionReviewTrackedProjectsDesc'),
              to: '/projects',
              emphasis: 'primary',
            },
            {
              id: 'govern-presets',
              label: t(locale, 'facade.actionGovernPresets'),
              description: t(locale, 'facade.actionGovernPresetsDesc'),
              to: '/presets',
              emphasis: 'secondary',
            },
            {
              id: 'tune-config',
              label: t(locale, 'facade.actionCheckGlobalBaseline'),
              description: t(locale, 'facade.actionCheckGlobalBaselineDesc'),
              to: '/config',
              emphasis: 'secondary',
            },
          ],
      relationshipSummary: {
        heading: t(locale, 'facade.relationshipHeading'),
        items: buildRelationshipSummaryItems({
          globalEnabledPresets,
          globalEnabledSkills,
          trackedProjects: projects.length,
          presetDefinitions,
          totalDirectAssignments,
        }, locale),
      },
      totals: {
        projects: projects.length,
        presets: presetDefinitions.length,
        skills: skills.length,
        globalEnabledSkills: globalEnabledSkills.length,
        globalEnabledPresets: globalEnabledPresets.length,
      },
      recentProjects: projects.slice(0, 5),
    };
  }

  async getConfig(locale: UiLocale = DEFAULT_UI_LOCALE): Promise<ConfigView> {
    const { config, paths } = await loadConfig();
    return toConfigView(config, paths, this.isFolderPickerAvailable(), locale);
  }

  async updateConfig(payload: unknown, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<ConfigView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.configPayloadMustBeObject'),
      t(locale, 'facade.configPayloadHint'),
    ) as { skillsDir?: unknown; defaultTargets?: unknown };

    if (body.skillsDir !== undefined && (typeof body.skillsDir !== 'string' || body.skillsDir.trim().length === 0)) {
      throw new UiValidationError('usage', t(locale, 'facade.skillsDirMustBeNonEmpty'), {
        hint: t(locale, 'facade.skillsDirHint'),
        fieldErrors: {
          skillsDir: t(locale, 'facade.skillsDirField'),
        },
      });
    }

    if (body.defaultTargets !== undefined && !Array.isArray(body.defaultTargets)) {
      throw new UiValidationError('usage', t(locale, 'facade.defaultTargetsMustBeArray'), {
        hint: t(locale, 'facade.defaultTargetsHint', { targets: SUPPORTED_TARGETS.join(', ') }),
        fieldErrors: {
          defaultTargets: t(locale, 'facade.defaultTargetsHint', { targets: SUPPORTED_TARGETS.join(', ') }),
        },
      });
    }

    let nextConfig;
    try {
      nextConfig = await updateConfig({
        skillsDir: typeof body.skillsDir === 'string' ? body.skillsDir : undefined,
        defaultTargets:
          body.defaultTargets !== undefined ? requireStringArray('defaultTargets', body.defaultTargets, locale) : undefined,
      });
    } catch (error) {
      mapConfigError(error, body, locale);
    }

    const { paths } = await loadConfig();
    return toConfigView(nextConfig, paths, this.isFolderPickerAvailable(), locale);
  }

  async pickSkillsDirectory(locale: UiLocale = DEFAULT_UI_LOCALE): Promise<FolderPickView> {
    if (!this.isFolderPickerAvailable()) {
      throw new UiValidationError('usage', t(locale, 'config.folderPickerUnavailable'), {
        hint: t(locale, 'config.pickerUnavailableHint'),
      });
    }

    return this.pickFolderPath(locale);
  }

  async getProjects(): Promise<ProjectSummaryView[]> {
    const { paths } = await loadConfig();
    const index = await loadProjectsIndex(paths.projectsFile);
    return Object.entries(index.projects)
      .map(([projectPath, entry]) => toProjectSummary(projectPath, entry))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getBoot(launchCwd: string, launchStatus: LaunchStatusView): Promise<BootView> {
    const { paths } = await loadConfig();
    const index = await loadProjectsIndex(paths.projectsFile);
    const launchPath = await resolveRealPath(launchCwd);
    const matchedRecord = await findMatchedProjectRecord(launchPath, index.projects);
    const matchedProjectId = matchedRecord ? encodeProjectId(matchedRecord.projectPath) : null;

    return {
      initialRoute: matchedProjectId ? `/projects/${encodeURIComponent(matchedProjectId)}` : '/overview',
      launchCwd: launchPath,
      matchedProjectId,
      matchedProjectName: matchedRecord ? getProjectDisplayName(matchedRecord.projectPath) : null,
      launchStatus,
    };
  }

  private async resolveProjectPath(projectId: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<string> {
    const decodedProjectPath = decodeProjectId(projectId);
    const { paths } = await loadConfig();
    const projects = await loadProjectsIndex(paths.projectsFile);
    if (!projects.projects[decodedProjectPath]) {
      throw new SkmError('config', t(locale, 'facade.projectNotFound', { projectId }), {
        hint: t(locale, 'facade.projectNotFoundHint'),
      });
    }

    return decodedProjectPath;
  }

  async getProjectDetail(projectId: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<ProjectDetailView> {
    const projectPath = await this.resolveProjectPath(projectId, locale);
    const [state, presetDefinitions, skills] = await Promise.all([
      loadProjectState(projectPath),
      listPresetDefinitions(),
      loadConfig().then(({ config }) => listSkills(config.skillsDir)),
    ]);

    if (!state) {
      throw new SkmError('config', t(locale, 'facade.projectStateMissing', { projectPath }), {
        hint: t(locale, 'facade.projectStateMissingHint'),
      });
    }

    const presetMap = new Map(presetDefinitions.map((preset) => [preset.name, preset]));
    const directSkills = new Set(state.enabledSkills);
    const presetSkillsByName = new Map<string, string[]>();

    for (const presetName of state.enabledPresets) {
      for (const skillName of presetMap.get(presetName)?.skills ?? []) {
        const current = presetSkillsByName.get(skillName) ?? [];
        current.push(presetName);
        presetSkillsByName.set(skillName, current);
      }
    }

    const allResolvedSkillNames = sortStrings(new Set([...directSkills, ...presetSkillsByName.keys()]));
    const resolvedSkills: ResolvedSkillView[] = allResolvedSkillNames.map((name) => {
      const viaPresets = sortStrings(new Set(presetSkillsByName.get(name) ?? []));
      const direct = directSkills.has(name);
      const sources: ResolvedSkillSourceView[] = [
        ...(direct ? [{ kind: 'direct' as const, label: t(locale, 'facade.directLabel') }] : []),
        ...viaPresets.map((presetName) => ({
          kind: 'preset' as const,
          label: t(locale, 'facade.viaPresetLabel', { name: presetName }),
          presetName,
        })),
      ];

      return {
        name,
        sourceLabels: sources.map((source) => source.label),
        direct,
        viaPresets,
        sources,
      };
    });

    const presetControls = presetDefinitions
      .map<ProjectPresetControlView>((preset) => ({
        name: preset.name,
        skills: [...preset.skills],
        source: preset.source,
        readonly: preset.readonly,
        enabled: state.enabledPresets.includes(preset.name),
        editable: true,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    const skillControls = skills
      .map<ProjectSkillControlView>((skill) => {
        const viaPresets = sortStrings(new Set(presetSkillsByName.get(skill.name) ?? []));
        const direct = directSkills.has(skill.name);
        const enabled = direct || viaPresets.length > 0;
        const editable = direct || viaPresets.length === 0;
        return {
          name: skill.name,
          description: skill.description,
          path: skill.dirPath,
          enabled,
          editable,
          direct,
          viaPresets,
          reason: !editable ? t(locale, 'projectDetail.controlledByPreset', { names: viaPresets.join(', ') }) : undefined,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      ...createProjectReference(projectPath),
      targets: sortStrings(Object.keys(state.targets)) as TargetName[],
      updatedAt: state.updatedAt,
      enabledPresets: sortStrings(state.enabledPresets).map((name) => toEnabledPresetView(name, presetMap.get(name))),
      enabledSkills: sortStrings(new Set(state.enabledSkills)),
      presetControls: {
        enabled: presetControls.filter((preset) => preset.enabled),
        available: presetControls.filter((preset) => !preset.enabled),
      },
      skillControls: {
        enabled: skillControls.filter((skill) => skill.enabled),
        available: skillControls.filter((skill) => !skill.enabled),
      },
      resolvedSkills,
      quickActions: buildProjectQuickActions(projectPath, locale),
    };
  }

  async quickOpenProject(projectId: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<QuickOpenView> {
    const projectPath = await this.resolveProjectPath(projectId, locale);
    return this.openProjectPath(projectPath, locale);
  }

  async quickOpenProjectParent(projectId: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<QuickOpenView> {
    const projectPath = await this.resolveProjectPath(projectId, locale);
    const parentPath = path.dirname(projectPath);
    return this.openProjectPath(parentPath, locale);
  }

  async quickOpenSkill(skillName: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<QuickOpenView> {
    const normalizedName = skillName.trim();
    if (normalizedName.length === 0) {
      throw new UiValidationError('usage', t(locale, 'server.upstream.skillNameRequired'), {
        hint: t(locale, 'server.upstream.skillNameRequiredHint'),
      });
    }

    const { config } = await loadConfig();
    const skill = await getSkillByName(config.skillsDir, normalizedName);
    return this.openProjectPath(getSkillOpenPath(skill), locale);
  }

  async quickOpenPath(targetPath: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<QuickOpenView> {
    return this.openProjectPath(targetPath, locale);
  }

  async getPresets(locale: UiLocale = DEFAULT_UI_LOCALE): Promise<PresetsView> {
    const [presetDefinitions, { paths }] = await Promise.all([listPresetDefinitions(), loadConfig()]);
    const projects = await loadProjectsIndex(paths.projectsFile);
    const references = buildPresetReferenceIndex(projects.projects);

    const items = presetDefinitions
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((preset) => {
        const uniqueSkills = sortStrings(new Set(preset.skills));
        const referenceProjects = references.byPreset.get(preset.name) ?? [];
        return {
          name: preset.name,
          skills: uniqueSkills,
          skillCount: uniqueSkills.length,
          referenceCount: referenceProjects.length,
          referenceProjectIds: referenceProjects.map((projectPath) => encodeProjectId(projectPath)),
          source: preset.source,
          readonly: preset.readonly,
        };
      });

    return {
      items,
      quickActions: buildPresetsQuickActions(locale),
    };
  }

  async getPresetDetail(name: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<PresetDetailView> {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      throw new UiValidationError('usage', t(locale, 'facade.presetNameRequired'), {
        hint: t(locale, 'facade.presetNameHint'),
      });
    }

    let preset: Awaited<ReturnType<typeof getPresetDefinitionByName>>;
    let referenceProjectPaths: Awaited<ReturnType<typeof findPresetReferences>>;
    let skills: Awaited<ReturnType<typeof listSkills>>;
    try {
      [preset, referenceProjectPaths, skills] = await Promise.all([
        getPresetDefinitionByName(normalizedName),
        findPresetReferences(normalizedName),
        loadConfig().then(({ config }) => listSkills(config.skillsDir)),
      ]);
    } catch (error) {
      mapPresetRegistryError(error, locale);
    }

    const includedSkills = new Set(preset.skills);
    return {
      name: preset.name,
      source: preset.source,
      readonly: preset.readonly,
      skillCount: preset.skills.length,
      referenceCount: referenceProjectPaths.length,
      includedSkills: sortStrings(includedSkills),
      availableSkills: skills
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
          path: skill.dirPath,
          included: includedSkills.has(skill.name),
          editable: !preset.readonly,
          reason: preset.readonly ? t(locale, 'facade.presetReadonly') : undefined,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      affectedProjects: referenceProjectPaths.map((projectPath) => createProjectReference(projectPath)),
    };
  }

  async getPresetDeletePreview(name: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<PresetDeletePreviewView> {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      throw new UiValidationError('usage', t(locale, 'facade.presetNameRequired'), {
        hint: t(locale, 'facade.presetNameHint'),
      });
    }

    let preset: Awaited<ReturnType<typeof getPresetDefinitionByName>>;
    let referenceProjects: Awaited<ReturnType<typeof findPresetReferences>>;
    try {
      [preset, referenceProjects] = await Promise.all([
        getPresetDefinitionByName(normalizedName),
        findPresetReferences(normalizedName),
      ]);
    } catch (error) {
      mapPresetRegistryError(error, locale);
    }

    return {
      name: normalizedName,
      referenceCount: referenceProjects.length,
      source: preset.source,
      readonly: preset.readonly,
      referenceProjects: referenceProjects.map((projectPath) => createProjectReference(projectPath)),
    };
  }

  async getSkills(): Promise<SkillsView> {
    const [{ config, paths }, presetDefinitions, globalState] = await Promise.all([
      loadConfig(),
      listPresetDefinitions(),
      loadConfig().then(({ paths: loadedPaths }) => loadGlobalState(loadedPaths)),
    ]);
    const [skills, projectsIndex] = await Promise.all([listSkills(config.skillsDir), loadProjectsIndex(paths.projectsFile)]);

    const presetMap = new Map(presetDefinitions.map((preset) => [preset.name, new Set(preset.skills)]));
    const globalEnabledSkills = new Set(globalState?.enabledSkills ?? []);

    const items = await Promise.all(
      skills.map(async (skill) => {
        const directProjects: SkillIntersectionProjectView[] = [];
        const viaPresetProjects: SkillIntersectionProjectView[] = [];

        for (const [projectPath, entry] of Object.entries(projectsIndex.projects)) {
          if (entry.enabledSkills.includes(skill.name)) {
            directProjects.push(createProjectReference(projectPath));
          }

          const viaPresetNames = sortStrings(
            entry.enabledPresets.filter((presetName) => presetMap.get(presetName)?.has(skill.name)),
          );

          if (viaPresetNames.length > 0) {
            viaPresetProjects.push({
              ...createProjectReference(projectPath),
              viaPresetNames,
            });
          }
        }

        return {
          name: skill.name,
          description: skill.description,
          path: skill.dirPath,
          displayPath: normalizeDisplayPath(skill.dirPath),
          fullPath: skill.dirPath,
          openPath: getSkillOpenPath(skill),
          locationKind: toSkillLocationKind(skill),
          globalEnabled: globalEnabledSkills.has(skill.name),
          updatedAt: await getSkillUpdatedAt(skill.skillFilePath),
          directProjects: directProjects.sort((left, right) => left.displayName.localeCompare(right.displayName)),
          viaPresetProjects: viaPresetProjects.sort((left, right) => left.displayName.localeCompare(right.displayName)),
        };
      }),
    );

    return {
      items: items.sort((left, right) => left.name.localeCompare(right.name)),
    };
  }

  async enableGlobalSkills(payload: unknown, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<SkillsView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.enableGlobalSkillPayload'),
      t(locale, 'facade.enableGlobalSkillPayloadHint'),
    ) as { skillNames?: unknown; targets?: unknown };

    await enableSkills({
      scope: 'global',
      skillNames: requireStringArray('skillNames', body.skillNames, locale),
      targets: body.targets === undefined ? undefined : requireStringArray('targets', body.targets, locale),
    });

    return this.getSkills();
  }

  async disableGlobalSkills(payload: unknown, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<SkillsView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.disableGlobalSkillPayload'),
      t(locale, 'facade.disableGlobalSkillPayloadHint'),
    ) as { skillNames?: unknown };

    await disableSkills({
      scope: 'global',
      skillNames: requireStringArray('skillNames', body.skillNames, locale),
    });

    return this.getSkills();
  }

  async enableProjectSkills(
    projectId: string,
    payload: unknown,
    locale: UiLocale = DEFAULT_UI_LOCALE,
  ): Promise<ProjectDetailView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.enableProjectSkillPayload'),
      t(locale, 'facade.enableProjectSkillPayloadHint'),
    ) as { skillNames?: unknown; targets?: unknown };
    const projectPath = await this.resolveProjectPath(projectId, locale);
    await enableSkills({
      projectPath,
      skillNames: requireStringArray('skillNames', body.skillNames, locale),
      targets: body.targets === undefined ? [] : requireStringArray('targets', body.targets, locale),
    });

    return this.getProjectDetail(projectId, locale);
  }

  async disableProjectSkills(
    projectId: string,
    payload: unknown,
    locale: UiLocale = DEFAULT_UI_LOCALE,
  ): Promise<ProjectDetailView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.disableProjectSkillPayload'),
      t(locale, 'facade.disableProjectSkillPayloadHint'),
    ) as { skillNames?: unknown };
    const projectPath = await this.resolveProjectPath(projectId, locale);
    await disableSkills({
      projectPath,
      skillNames: requireStringArray('skillNames', body.skillNames, locale),
    });

    return this.getProjectDetail(projectId, locale);
  }

  async enableProjectPresets(
    projectId: string,
    payload: unknown,
    locale: UiLocale = DEFAULT_UI_LOCALE,
  ): Promise<ProjectDetailView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.enablePresetPayload'),
      t(locale, 'facade.enablePresetPayloadHint'),
    ) as { presetNames?: unknown; targets?: unknown };
    const projectPath = await this.resolveProjectPath(projectId, locale);
    await enablePresets({
      projectPath,
      presetNames: requireStringArray('presetNames', body.presetNames, locale),
      targets: body.targets === undefined ? [] : requireStringArray('targets', body.targets, locale),
    });

    return this.getProjectDetail(projectId, locale);
  }

  async disableProjectPresets(
    projectId: string,
    payload: unknown,
    locale: UiLocale = DEFAULT_UI_LOCALE,
  ): Promise<ProjectDetailView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.disablePresetPayload'),
      t(locale, 'facade.disablePresetPayloadHint'),
    ) as { presetNames?: unknown };
    const projectPath = await this.resolveProjectPath(projectId, locale);
    await disablePresets({
      projectPath,
      presetNames: requireStringArray('presetNames', body.presetNames, locale),
    });

    return this.getProjectDetail(projectId, locale);
  }

  async createPreset(payload: unknown, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<PresetsView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.createPresetPayload'),
      t(locale, 'facade.createPresetPayloadHint'),
    ) as { name?: unknown; skills?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0) {
      throw new UiValidationError('usage', t(locale, 'facade.presetNameRequired'), {
        hint: t(locale, 'facade.presetNameHint'),
        fieldErrors: {
          name: t(locale, 'facade.presetNameFieldRequired'),
        },
      });
    }

    const existingPresets = await listPresetDefinitions();
    if (existingPresets.some((preset) => preset.name === name)) {
      throw new UiValidationError('conflict', t(locale, 'facade.presetAlreadyExists', { name }), {
        hint: t(locale, 'facade.presetAlreadyExistsHint'),
        fieldErrors: {
          name: t(locale, 'facade.presetNameFieldConflict'),
        },
      });
    }

    try {
      await addPresetDefinition({
        name,
        skills: requireStringArray('skills', body.skills, locale),
      });
    } catch (error) {
      mapPresetRegistryError(error, locale);
    }

    return this.getPresets(locale);
  }

  async updatePreset(name: string, payload: unknown, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<PresetsView> {
    const body = requireObjectPayload(
      payload,
      t(locale, 'facade.updatePresetPayload'),
      t(locale, 'facade.updatePresetPayloadHint'),
    ) as { skills?: unknown };
    try {
      await updatePresetDefinition({
        name,
        skills: requireStringArray('skills', body.skills, locale),
      });
    } catch (error) {
      mapPresetRegistryError(error, locale);
    }

    return this.getPresets(locale);
  }

  async deletePreset(name: string, locale: UiLocale = DEFAULT_UI_LOCALE): Promise<PresetDeleteView> {
    const presetsBeforeDelete = await this.getPresets(locale);
    const deletedPreset = presetsBeforeDelete.items.find((item) => item.name === name);
    const referenceProjectIds = deletedPreset?.referenceProjectIds ?? [];

    try {
      await deletePresetDefinition(name);
    } catch (error) {
      mapPresetRegistryError(error, locale);
    }

    return {
      deleted: {
        name,
        referenceCount: referenceProjectIds.length,
        referenceProjectIds,
      },
      presets: await this.getPresets(locale),
    };
  }
}
