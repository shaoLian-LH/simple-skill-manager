import { loadConfig } from '../config/service.js';
import { SkmError } from '../errors.js';
import { loadProjectsIndex } from '../project/projects-index.js';
import type { PresetDefinition, PresetsMap } from '../types.js';
import { uniqueSorted } from '../utils/collection.js';
import { toDisplayPath } from '../utils/path.js';

import { listSkills } from './skills.js';
import {
  buildDynamicPresets,
  buildReadonlyPresetError,
  loadSkillsDir,
  loadStaticPresets,
  mergePresetDefinitions,
  saveStaticPresets,
  toPresetMap,
} from './preset-catalog.js';

function validatePresetName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0) {
    throw new SkmError('usage', 'Preset name cannot be empty.', {
      hint: 'Provide a non-empty preset name.',
    });
  }

  return normalized;
}

function validatePresetSkills(skills: string[]): string[] {
  const normalized = uniqueSorted(
    skills
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0),
  );

  if (normalized.length === 0) {
    throw new SkmError('usage', 'Preset skills cannot be empty.', {
      hint: 'Provide at least one skill name.',
    });
  }

  return normalized;
}

export async function listStaticPresets(): Promise<PresetsMap> {
  return loadStaticPresets();
}

export async function listPresetDefinitions(): Promise<PresetDefinition[]> {
  const [skillsDir, staticPresets] = await Promise.all([loadSkillsDir(), listStaticPresets()]);
  const skills = await listSkills(skillsDir);
  return mergePresetDefinitions(staticPresets, buildDynamicPresets(skills));
}

export async function listPresets(): Promise<PresetsMap> {
  return toPresetMap(await listPresetDefinitions());
}

export async function getPresetDefinitionByName(name: string): Promise<PresetDefinition> {
  const preset = (await listPresetDefinitions()).find((entry) => entry.name === name);

  if (!preset) {
    throw new SkmError('config', `Preset ${name} was not found.`, {
      hint: 'Check `skm preset list` to see the available presets.',
    });
  }

  return preset;
}

export async function getPresetByName(name: string): Promise<string[]> {
  return (await getPresetDefinitionByName(name)).skills;
}

export async function addPresetDefinition(input: { name: string; skills: string[] }): Promise<{ name: string; skills: string[] }> {
  const name = validatePresetName(input.name);
  const skills = validatePresetSkills(input.skills);
  await assertSkillsExist(skills);
  const presets = await listStaticPresets();
  const presetDefinitions = await listPresetDefinitions();

  if (presetDefinitions.some((preset) => preset.name === name)) {
    throw new SkmError('conflict', `Preset ${name} already exists.`, {
      hint: 'Use `skm preset update <name> <skill...>` to replace its skills.',
    });
  }

  await saveStaticPresets({ ...presets, [name]: skills });
  return { name, skills };
}

export async function updatePresetDefinition(input: { name: string; skills: string[] }): Promise<{ name: string; skills: string[] }> {
  const name = validatePresetName(input.name);
  const skills = validatePresetSkills(input.skills);
  await assertSkillsExist(skills);
  const presets = await listStaticPresets();

  if (!presets[name]) {
    const preset = await listPresetDefinitions().then((entries) => entries.find((entry) => entry.name === name));
    if (preset?.readonly) {
      throw buildReadonlyPresetError(name);
    }
  }

  if (!presets[name]) {
    throw new SkmError('config', `Preset ${name} was not found.`, {
      hint: 'Check `skm preset list` to see the available presets.',
    });
  }

  await saveStaticPresets({ ...presets, [name]: skills });
  return { name, skills };
}

export async function deletePresetDefinition(name: string): Promise<{ name: string }> {
  const normalized = validatePresetName(name);
  const presets = await listStaticPresets();

  if (!presets[normalized]) {
    const preset = await listPresetDefinitions().then((entries) => entries.find((entry) => entry.name === normalized));
    if (preset?.readonly) {
      throw buildReadonlyPresetError(normalized);
    }
  }

  if (!presets[normalized]) {
    throw new SkmError('config', `Preset ${normalized} was not found.`, {
      hint: 'Check `skm preset list` to see the available presets.',
    });
  }

  const nextPresets: PresetsMap = { ...presets };
  delete nextPresets[normalized];
  await saveStaticPresets(nextPresets);
  return { name: normalized };
}

export async function findPresetReferences(presetName: string): Promise<string[]> {
  const normalized = validatePresetName(presetName);
  const { paths } = await loadConfig();
  const index = await loadProjectsIndex(paths.projectsFile);

  return Object.entries(index.projects)
    .filter(([, entry]) => entry.enabledPresets.includes(normalized))
    .map(([projectPath]) => projectPath)
    .sort((left, right) => left.localeCompare(right));
}

async function assertSkillsExist(skillNames: string[]): Promise<void> {
  const skillsDir = await loadSkillsDir();
  const knownSkills = new Set((await listSkills(skillsDir)).map((skill) => skill.name));
  const missing = skillNames.filter((skill) => !knownSkills.has(skill));
  if (missing.length === 0) {
    return;
  }

  throw new SkmError('config', `Preset references unknown skill(s): ${missing.join(', ')}.`, {
    details: `Configured skills directory: ${toDisplayPath(skillsDir)}.`,
    hint: 'Run `skm skill list` and use only existing skill names in preset definitions.',
  });
}
