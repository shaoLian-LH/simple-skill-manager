import fs from 'node:fs/promises';

import YAML from 'yaml';

import { GLOBAL_PRESETS_FILE } from '../constants.js';
import { SkmError } from '../errors.js';
import { pathExists, writeTextFileAtomic } from '../utils/fs.js';
import { toDisplayPath } from '../utils/path.js';
import { getGlobalPaths, type GlobalPaths } from './paths.js';

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
