import fs from 'node:fs/promises';

import {
  CONFIG_VERSION,
  DEFAULT_PRESETS_YAML,
  createDefaultConfig,
  createDefaultProjectsIndex,
} from '../constants.js';
import { SkmError } from '../errors.js';
import { assertSupportedTargets } from '../install/targets.js';
import type { Config } from '../types.js';
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic, writeTextFileIfMissing } from '../utils/fs.js';
import { resolveUserPath, toDisplayPath } from '../utils/path.js';
import { loadPresetsFile, parsePresetYaml, writePresetYaml } from './presets-store.js';
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

  assertSupportedTargets(config.defaultTargets);

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

export interface UpdateConfigRequest {
  skillsDir?: string;
  defaultTargets?: string[];
}

export async function updateConfig(request: UpdateConfigRequest): Promise<Config> {
  const { config, paths } = await loadConfig();
  const nextConfig: Config = { ...config };

  if (request.skillsDir !== undefined) {
    const resolvedPath = resolveUserPath(request.skillsDir);
    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      throw new SkmError('config', `Skills directory does not exist: ${toDisplayPath(resolvedPath)}.`, {
        hint: 'Create the directory first, then update `skillsDir` again.',
      });
    }

    if (!stat.isDirectory()) {
      throw new SkmError('config', `Skills directory is not a directory: ${toDisplayPath(resolvedPath)}.`, {
        hint: 'Choose an existing directory for `skillsDir`.',
      });
    }

    nextConfig.skillsDir = resolvedPath;
  }

  if (request.defaultTargets !== undefined) {
    assertSupportedTargets(request.defaultTargets);
    nextConfig.defaultTargets = [...new Set(request.defaultTargets)];
  }

  if (request.skillsDir === undefined && request.defaultTargets === undefined) {
    throw new SkmError('usage', 'At least one config field is required.', {
      hint: 'Provide `skillsDir` and/or `defaultTargets`.',
    });
  }

  await writeJsonFileAtomic(paths.configFile, nextConfig);
  return nextConfig;
}

export { loadPresetsFile, parsePresetYaml, writePresetYaml };
