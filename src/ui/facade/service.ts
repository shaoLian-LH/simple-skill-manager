import fs from 'node:fs/promises';
import path from 'node:path';

import { disablePresets, disableSkills, enablePresets, enableSkills } from '../../core/activation/service.js';
import { loadConfig, updateConfig } from '../../core/config/service.js';
import { SkmError } from '../../core/errors.js';
import { loadProjectsIndex } from '../../core/project/projects-index.js';
import {
  addPresetDefinition,
  deletePresetDefinition,
  getPresetDefinitionByName,
  listPresetDefinitions,
  updatePresetDefinition,
} from '../../core/registry/presets.js';
import { listSkills } from '../../core/registry/skills.js';
import { loadProjectState } from '../../core/state/project-state.js';
import { SUPPORTED_TARGETS, type ProjectIndexEntry, type TargetName } from '../../core/types.js';
import type { PresetDefinition } from '../../core/types.js';
import type {
  BootView,
  ConfigView,
  DashboardView,
  LaunchStatusView,
  PresetDeleteView,
  PresetDeletePreviewView,
  PresetsView,
  ProjectDetailView,
  ProjectSummaryView,
  QuickActionView,
  QuickOpenView,
  SkillsView,
} from '../contracts/api.js';
import { UiValidationError } from '../server/errors.js';
import { quickOpenProjectPath } from '../system/quick-open.js';
import { decodeProjectId, encodeProjectId } from './project-id.js';

interface PresetReferenceIndex {
  byPreset: Map<string, string[]>;
}

export interface UiFacadeDependencies {
  openProjectPath?: (projectPath: string) => Promise<QuickOpenView>;
}

function sortStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function toProjectSummary(projectPath: string, entry: ProjectIndexEntry): ProjectSummaryView {
  return {
    projectId: encodeProjectId(projectPath),
    projectPath,
    targets: [...entry.targets],
    enabledSkillCount: entry.enabledSkills.length,
    enabledPresetCount: entry.enabledPresets.length,
    updatedAt: entry.updatedAt,
  };
}

function buildGlobalQuickActions(): QuickActionView[] {
  return [
    {
      id: 'config-get',
      label: 'View global config',
      command: 'skm config get',
    },
    {
      id: 'preset-list',
      label: 'List presets',
      command: 'skm preset list',
    },
    {
      id: 'skill-list',
      label: 'List skills',
      command: 'skm skill list',
    },
  ];
}

function buildConfigQuickActions(): QuickActionView[] {
  return [
    {
      id: 'config-get',
      label: 'Inspect current config',
      command: 'skm config get',
    },
    {
      id: 'config-set-skills-dir',
      label: 'Set skills directory',
      command: 'skm config set skills-dir <path>',
    },
  ];
}

function buildPresetsQuickActions(): QuickActionView[] {
  return [
    {
      id: 'preset-list',
      label: 'List presets',
      command: 'skm preset list',
    },
    {
      id: 'preset-add',
      label: 'Create preset',
      command: 'skm preset add <name> <skill...>',
    },
    {
      id: 'preset-update',
      label: 'Update preset',
      command: 'skm preset update <name> <skill...>',
    },
  ];
}

function buildProjectQuickActions(projectPath: string): QuickActionView[] {
  return [
    {
      id: 'doctor',
      label: 'Doctor project',
      command: `cd ${JSON.stringify(projectPath)} && skm doctor`,
    },
    {
      id: 'sync',
      label: 'Sync project',
      command: `cd ${JSON.stringify(projectPath)} && skm sync`,
    },
    {
      id: 'quick-open',
      label: 'Open project directory',
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

function toEnabledPresetView(name: string, metadata: PresetDefinition | undefined) {
  return {
    name,
    skills: sortStrings(new Set(metadata?.skills ?? [])),
    source: metadata?.source ?? 'static',
    readonly: metadata?.readonly ?? false,
  };
}

function requireStringArray(name: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new UiValidationError('usage', `${name} must be a string array.`, {
      hint: `Provide \`${name}\` as a JSON string array.`,
      fieldErrors: {
        [name]: `${name} must be a list of strings.`,
      },
    });
  }

  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function toConfigView(config: Awaited<ReturnType<typeof updateConfig>> | Awaited<ReturnType<typeof loadConfig>>['config'], paths: Awaited<ReturnType<typeof loadConfig>>['paths']): ConfigView {
  return {
    skillsDir: config.skillsDir,
    defaultTargets: [...config.defaultTargets],
    supportedTargets: [...SUPPORTED_TARGETS],
    quickActions: buildConfigQuickActions(),
    paths: {
      configFile: paths.configFile,
      presetsFile: paths.presetsFile,
      projectsFile: paths.projectsFile,
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

function mapConfigError(error: unknown, body: { skillsDir?: unknown; defaultTargets?: unknown }): never {
  if (!(error instanceof SkmError)) {
    throw error;
  }

  const fieldErrors: Record<string, string> = {};
  if (body.skillsDir !== undefined && error.message.includes('Skills directory')) {
    fieldErrors.skillsDir = error.message;
  }
  if (body.defaultTargets !== undefined && error.message.includes('target')) {
    fieldErrors.defaultTargets = error.message;
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new UiValidationError(error.kind === 'runtime' ? 'config' : error.kind, error.message, {
      details: error.details,
      hint: error.hint,
      fieldErrors,
      cause: error,
    });
  }

  throw error;
}

export class UiFacade {
  private readonly openProjectPath: (projectPath: string) => Promise<QuickOpenView>;

  constructor(deps: UiFacadeDependencies = {}) {
    this.openProjectPath = deps.openProjectPath ?? quickOpenProjectPath;
  }

  async getDashboard(): Promise<DashboardView> {
    const [{ config }, presetDefinitions, projectsIndex, skills] = await Promise.all([
      loadConfig(),
      listPresetDefinitions(),
      loadConfig().then(({ paths }) => loadProjectsIndex(paths.projectsFile)),
      loadConfig().then(({ config: loadedConfig }) => listSkills(loadedConfig.skillsDir)),
    ]);

    void config;

    const projects = (Object.entries(projectsIndex.projects) as Array<[string, ProjectIndexEntry]>)
      .map(([projectPath, entry]) => toProjectSummary(projectPath, entry))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return {
      totals: {
        projects: projects.length,
        presets: presetDefinitions.length,
        skills: skills.length,
      },
      recentProjects: projects.slice(0, 5),
      quickActions: buildGlobalQuickActions(),
    };
  }

  async getConfig(): Promise<ConfigView> {
    const { config, paths } = await loadConfig();
    return toConfigView(config, paths);
  }

  async updateConfig(payload: unknown): Promise<ConfigView> {
    const body = requireObjectPayload(
      payload,
      'Config update payload must be an object.',
      'Send JSON like `{ "skillsDir": "...", "defaultTargets": [".agents"] }`.',
    ) as { skillsDir?: unknown; defaultTargets?: unknown };

    if (body.skillsDir !== undefined && (typeof body.skillsDir !== 'string' || body.skillsDir.trim().length === 0)) {
      throw new UiValidationError('usage', 'skillsDir must be a non-empty string.', {
        hint: 'Enter an existing directory path for `skillsDir`.',
        fieldErrors: {
          skillsDir: 'Enter an existing directory path.',
        },
      });
    }

    if (body.defaultTargets !== undefined && !Array.isArray(body.defaultTargets)) {
      throw new UiValidationError('usage', 'defaultTargets must be a string array.', {
        hint: `Use one or more of: ${SUPPORTED_TARGETS.join(', ')}`,
        fieldErrors: {
          defaultTargets: `Choose one or more of: ${SUPPORTED_TARGETS.join(', ')}`,
        },
      });
    }

    let nextConfig;
    try {
      nextConfig = await updateConfig({
        skillsDir: typeof body.skillsDir === 'string' ? body.skillsDir : undefined,
        defaultTargets: body.defaultTargets !== undefined ? requireStringArray('defaultTargets', body.defaultTargets) : undefined,
      });
    } catch (error) {
      mapConfigError(error, body);
    }

    const { paths } = await loadConfig();
    return toConfigView(nextConfig, paths);
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
    const launchPath = await fs.realpath(path.resolve(launchCwd)).catch(() => path.resolve(launchCwd));

    let matchedProjectPath: string | null = null;
    for (const projectPath of Object.keys(index.projects)) {
      const resolvedProjectPath = await fs.realpath(projectPath).catch(() => projectPath);
      if (resolvedProjectPath === launchPath) {
        matchedProjectPath = projectPath;
        break;
      }
    }

    const matchedProjectId = matchedProjectPath ? encodeProjectId(matchedProjectPath) : null;
    const initialRoute = matchedProjectId ? `/projects/${encodeURIComponent(matchedProjectId)}` : '/dashboard';

    return {
      initialRoute,
      launchCwd: launchPath,
      matchedProjectId,
      launchStatus,
    };
  }

  private async resolveProjectPath(projectId: string): Promise<string> {
    const decodedProjectPath = decodeProjectId(projectId);
    const { paths } = await loadConfig();
    const projects = await loadProjectsIndex(paths.projectsFile);
    if (!projects.projects[decodedProjectPath]) {
      throw new SkmError('config', `Project ${projectId} was not found in projects index.`, {
        hint: 'Load projects from `GET /api/projects` and use a returned `projectId`.',
      });
    }

    return decodedProjectPath;
  }

  async getProjectDetail(projectId: string): Promise<ProjectDetailView> {
    const projectPath = await this.resolveProjectPath(projectId);
    const state = await loadProjectState(projectPath);
    if (!state) {
      throw new SkmError('config', `Project state is missing for ${projectPath}.`, {
        hint: 'Re-enable a skill or preset in that project to recreate `.skm/state.json`.',
      });
    }

    const presetDefinitions = await listPresetDefinitions();
    const presetMap = new Map(presetDefinitions.map((preset) => [preset.name, preset]));
    const presetSkillMap = new Map<string, string[]>();

    for (const presetName of state.enabledPresets) {
      presetSkillMap.set(presetName, presetMap.get(presetName)?.skills ? [...(presetMap.get(presetName)?.skills ?? [])] : []);
    }

    const directSkills = new Set(state.enabledSkills);
    const presetSkillsByName = new Map<string, string[]>();
    for (const [presetName, skillNames] of presetSkillMap.entries()) {
      for (const skillName of skillNames) {
        const current = presetSkillsByName.get(skillName) ?? [];
        current.push(presetName);
        presetSkillsByName.set(skillName, current);
      }
    }

    const allSkillNames = sortStrings(new Set([...directSkills, ...presetSkillsByName.keys()]));
    const resolvedSkills = allSkillNames.map((name) => {
      const viaPresets = sortStrings(new Set(presetSkillsByName.get(name) ?? []));
      const direct = directSkills.has(name);
      const sourceLabels = [
        ...(direct ? ['direct'] : []),
        ...viaPresets.map((presetName) => `preset:${presetName}`),
      ];

      return {
        name,
        sourceLabels,
        direct,
        viaPresets,
      };
    });

    return {
      projectId: encodeProjectId(projectPath),
      projectPath,
      targets: sortStrings(Object.keys(state.targets)) as TargetName[],
      updatedAt: state.updatedAt,
      enabledPresets: sortStrings(state.enabledPresets).map((name) => toEnabledPresetView(name, presetMap.get(name))),
      enabledSkills: sortStrings(new Set(state.enabledSkills)),
      resolvedSkills,
      quickActions: buildProjectQuickActions(projectPath),
    };
  }

  async quickOpenProject(projectId: string): Promise<QuickOpenView> {
    const projectPath = await this.resolveProjectPath(projectId);
    return this.openProjectPath(projectPath);
  }

  async getPresets(): Promise<PresetsView> {
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
      quickActions: buildPresetsQuickActions(),
    };
  }

  async getPresetDeletePreview(name: string): Promise<PresetDeletePreviewView> {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      throw new UiValidationError('usage', 'Preset name is required.', {
        hint: 'Use a non-empty preset name.',
      });
    }

    const [preset, { paths }] = await Promise.all([getPresetDefinitionByName(normalizedName), loadConfig()]);

    const projectsIndex = await loadProjectsIndex(paths.projectsFile);
    const referenceProjects = Object.entries(projectsIndex.projects)
      .filter(([, entry]) => entry.enabledPresets.includes(normalizedName))
      .map(([projectPath]) => ({
        projectId: encodeProjectId(projectPath),
        projectPath,
      }))
      .sort((left, right) => left.projectPath.localeCompare(right.projectPath));

    return {
      name: normalizedName,
      referenceCount: referenceProjects.length,
      source: preset.source,
      readonly: preset.readonly,
      referenceProjects,
    };
  }

  async getSkills(): Promise<SkillsView> {
    const { config } = await loadConfig();
    const skills = await listSkills(config.skillsDir);
    return {
      items: skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        path: skill.dirPath,
      })),
    };
  }

  async enableProjectSkills(projectId: string, payload: unknown): Promise<ProjectDetailView> {
    const body = requireObjectPayload(
      payload,
      'Enable skill payload must be an object.',
      'Send JSON like `{ "skillNames": ["brainstorming"], "targets": [".agents"] }`.',
    ) as { skillNames?: unknown; targets?: unknown };
    const projectPath = await this.resolveProjectPath(projectId);
    await enableSkills({
      projectPath,
      skillNames: requireStringArray('skillNames', body.skillNames),
      targets: body.targets === undefined ? [] : requireStringArray('targets', body.targets),
    });

    return this.getProjectDetail(projectId);
  }

  async disableProjectSkills(projectId: string, payload: unknown): Promise<ProjectDetailView> {
    const body = requireObjectPayload(
      payload,
      'Disable skill payload must be an object.',
      'Send JSON like `{ "skillNames": ["brainstorming"] }`.',
    ) as { skillNames?: unknown };
    const projectPath = await this.resolveProjectPath(projectId);
    await disableSkills({
      projectPath,
      skillNames: requireStringArray('skillNames', body.skillNames),
    });

    return this.getProjectDetail(projectId);
  }

  async enableProjectPresets(projectId: string, payload: unknown): Promise<ProjectDetailView> {
    const body = requireObjectPayload(
      payload,
      'Enable preset payload must be an object.',
      'Send JSON like `{ "presetNames": ["frontend-basic"], "targets": [".agents"] }`.',
    ) as { presetNames?: unknown; targets?: unknown };
    const projectPath = await this.resolveProjectPath(projectId);
    await enablePresets({
      projectPath,
      presetNames: requireStringArray('presetNames', body.presetNames),
      targets: body.targets === undefined ? [] : requireStringArray('targets', body.targets),
    });

    return this.getProjectDetail(projectId);
  }

  async disableProjectPresets(projectId: string, payload: unknown): Promise<ProjectDetailView> {
    const body = requireObjectPayload(
      payload,
      'Disable preset payload must be an object.',
      'Send JSON like `{ "presetNames": ["frontend-basic"] }`.',
    ) as { presetNames?: unknown };
    const projectPath = await this.resolveProjectPath(projectId);
    await disablePresets({
      projectPath,
      presetNames: requireStringArray('presetNames', body.presetNames),
    });

    return this.getProjectDetail(projectId);
  }

  async createPreset(payload: unknown): Promise<PresetsView> {
    const body = requireObjectPayload(
      payload,
      'Create preset payload must be an object.',
      'Send JSON like `{ "name": "frontend", "skills": ["brainstorming"] }`.',
    ) as { name?: unknown; skills?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0) {
      throw new UiValidationError('usage', 'Preset name is required.', {
        hint: 'Provide a non-empty preset name.',
        fieldErrors: {
          name: 'Preset name is required.',
        },
      });
    }

    const existingPresets = await listPresetDefinitions();
    if (existingPresets.some((preset) => preset.name === name)) {
      throw new UiValidationError('conflict', `Preset ${name} already exists.`, {
        hint: 'Choose a different name or update the existing preset.',
        fieldErrors: {
          name: 'Choose a different preset name.',
        },
      });
    }

    await addPresetDefinition({
      name,
      skills: requireStringArray('skills', body.skills),
    });

    return this.getPresets();
  }

  async updatePreset(name: string, payload: unknown): Promise<PresetsView> {
    const body = requireObjectPayload(
      payload,
      'Update preset payload must be an object.',
      'Send JSON like `{ "skills": ["brainstorming"] }`.',
    ) as { skills?: unknown };
    await updatePresetDefinition({
      name,
      skills: requireStringArray('skills', body.skills),
    });

    return this.getPresets();
  }

  async deletePreset(name: string): Promise<PresetDeleteView> {
    const presetsBeforeDelete = await this.getPresets();
    const deletedPreset = presetsBeforeDelete.items.find((item) => item.name === name);
    const referenceProjectIds = deletedPreset?.referenceProjectIds ?? [];

    await deletePresetDefinition(name);

    return {
      deleted: {
        name,
        referenceCount: referenceProjectIds.length,
        referenceProjectIds,
      },
      presets: await this.getPresets(),
    };
  }
}
