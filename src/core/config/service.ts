import fs from 'node:fs/promises';

import YAML from 'yaml';

import {
  CONFIG_VERSION,
  DEFAULT_PRESETS_YAML,
  GLOBAL_PRESETS_FILE,
  createDefaultConfig,
  createDefaultProjectsIndex,
} from '../constants.js';
import { SkmError } from '../errors.js';
import type { Config, ProjectsIndex } from '../types.js';
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic, writeTextFileAtomic, writeTextFileIfMissing } from '../utils/fs.js';
import { resolveUserPath, toDisplayPath } from '../utils/path.js';
import { getGlobalPaths, type GlobalPaths } from './paths.js';

export interface InitResult {
  paths: GlobalPaths;
  created: string[];
  skipped: string[];
}

export async function initGlobalConfig(): Promise<InitResult> {
  const paths = getGlobalPaths();
  const created: string[] = [];
  const skipped: string[] = [];

  await ensureDir(paths.appDir);
  await ensureDir(paths.defaultSkillsDir);

  const wroteConfig = await writeTextFileIfMissing(
    paths.configFile,
    `${JSON.stringify(createDefaultConfig(paths.defaultSkillsDir), null, 2)}\n`,
  );
  (wroteConfig ? created : skipped).push(paths.configFile);

  const wrotePresets = await writeTextFileIfMissing(paths.presetsFile, DEFAULT_PRESETS_YAML);
  (wrotePresets ? created : skipped).push(paths.presetsFile);

  const wroteProjects = await writeTextFileIfMissing(
    paths.projectsFile,
    `${JSON.stringify(createDefaultProjectsIndex(), null, 2)}\n`,
  );
  (wroteProjects ? created : skipped).push(paths.projectsFile);

  return { paths, created, skipped };
}

export async function loadConfig(): Promise<{ config: Config; paths: GlobalPaths }> {
  const paths = getGlobalPaths();

  if (!(await pathExists(paths.configFile))) {
    throw new SkmError('config', `Global config is missing at ${toDisplayPath(paths.configFile)}.`, {
      hint: 'Run `skm config init` first.',
    });
  }

  const config = await readJsonFile<Config>(paths.configFile);

  if (config.version !== CONFIG_VERSION) {
    throw new SkmError('config', `Unsupported config version ${String((config as { version?: unknown }).version)}.`, {
      details: `Expected version ${CONFIG_VERSION} in ${toDisplayPath(paths.configFile)}.`,
      hint: 'Re-run `skm config init` or update the config file manually.',
    });
  }

  if (!Array.isArray(config.defaultTargets) || typeof config.skillsDir !== 'string') {
    throw new SkmError('config', `Config file ${toDisplayPath(paths.configFile)} is malformed.`, {
      hint: 'Fix the JSON structure or re-run `skm config init`.',
    });
  }

  return {
    config,
    paths,
  };
}

export async function setSkillsDir(inputPath: string): Promise<Config> {
  const { config, paths } = await loadConfig();
  const resolvedPath = resolveUserPath(inputPath);

  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    throw new SkmError('config', `Skills directory does not exist: ${toDisplayPath(resolvedPath)}.`, {
      hint: 'Create the directory first, then run `skm config set skills-dir <path>` again.',
    });
  }

  if (!stat.isDirectory()) {
    throw new SkmError('config', `Skills directory is not a directory: ${toDisplayPath(resolvedPath)}.`, {
      hint: 'Choose an existing directory that contains skill subdirectories.',
    });
  }

  const nextConfig: Config = {
    ...config,
    skillsDir: resolvedPath,
  };

  await writeJsonFileAtomic(paths.configFile, nextConfig);
  return nextConfig;
}

export async function loadProjectsIndex(paths?: GlobalPaths): Promise<ProjectsIndex> {
  const resolvedPaths = paths ?? getGlobalPaths();

  if (!(await pathExists(resolvedPaths.projectsFile))) {
    return createDefaultProjectsIndex();
  }

  const index = await readJsonFile<ProjectsIndex>(resolvedPaths.projectsFile);
  if (index.version !== CONFIG_VERSION || typeof index.projects !== 'object' || index.projects === null) {
    throw new SkmError('config', `Projects index ${toDisplayPath(resolvedPaths.projectsFile)} is malformed.`, {
      hint: 'Fix the file or re-run `skm config init`.',
    });
  }

  return index;
}

export async function writeProjectsIndex(index: ProjectsIndex, paths?: GlobalPaths): Promise<void> {
  const resolvedPaths = paths ?? getGlobalPaths();
  await writeJsonFileAtomic(resolvedPaths.projectsFile, index);
}

export async function loadPresetsFile(paths?: GlobalPaths): Promise<string> {
  const resolvedPaths = paths ?? getGlobalPaths();

  if (!(await pathExists(resolvedPaths.presetsFile))) {
    throw new SkmError('config', `Preset file is missing at ${toDisplayPath(resolvedPaths.presetsFile)}.`, {
      hint: 'Run `skm config init` first.',
    });
  }

  return fs.readFile(resolvedPaths.presetsFile, 'utf8');
}

export async function parsePresetYaml(paths?: GlobalPaths): Promise<Record<string, string[]>> {
  const resolvedPaths = paths ?? getGlobalPaths();
  const raw = await loadPresetsFile(resolvedPaths);

  let parsed: unknown;
  try {
    parsed = YAML.parse(raw) ?? {};
  } catch (error) {
    throw new SkmError('config', `Preset file ${toDisplayPath(resolvedPaths.presetsFile)} is invalid YAML.`, {
      details: error instanceof Error ? error.message : undefined,
      hint: `Repair ${GLOBAL_PRESETS_FILE} so each preset maps to a string array.`,
      cause: error,
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SkmError('config', `Preset file ${toDisplayPath(resolvedPaths.presetsFile)} must be a mapping.`, {
      hint: `Repair ${GLOBAL_PRESETS_FILE} so each preset maps to a string array.`,
    });
  }

  const presets: Record<string, string[]> = {};

  for (const [presetName, value] of Object.entries(parsed)) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new SkmError('config', `Preset ${presetName} in ${toDisplayPath(resolvedPaths.presetsFile)} must be a string array.`, {
        hint: `Repair ${GLOBAL_PRESETS_FILE} so each preset maps to a string array.`,
      });
    }

    presets[presetName] = [...value];
  }

  return presets;
}

export async function writePresetYaml(presets: Record<string, string[]>, paths?: GlobalPaths): Promise<void> {
  const resolvedPaths = paths ?? getGlobalPaths();
  const normalized = Object.fromEntries(
    Object.entries(presets)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, skills]) => [name, [...new Set(skills)].sort((left, right) => left.localeCompare(right))]),
  );
  const payload = YAML.stringify(normalized);
  await writeTextFileAtomic(resolvedPaths.presetsFile, payload.endsWith('\n') ? payload : `${payload}\n`);
}
