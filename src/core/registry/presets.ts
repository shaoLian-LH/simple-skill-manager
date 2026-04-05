import { loadConfig, parsePresetYaml, writePresetYaml } from '../config/service.js';
import { SkmError } from '../errors.js';
import { loadProjectsIndex } from '../project/projects-index.js';
import { listSkills } from '../registry/skills.js';
import type { PresetsMap } from '../types.js';
import { uniqueSorted } from '../utils/collection.js';
import { toDisplayPath } from '../utils/path.js';

export async function listPresets(): Promise<PresetsMap> {
  return parsePresetYaml();
}

export async function getPresetByName(name: string): Promise<string[]> {
  const presets = await listPresets();
  const preset = presets[name];

  if (!preset) {
    throw new SkmError('config', `Preset ${name} was not found.`, {
      hint: 'Check `skm preset list` to see the available presets.',
    });
  }

  return preset;
}

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

export async function addPresetDefinition(input: { name: string; skills: string[] }): Promise<{ name: string; skills: string[] }> {
  const name = validatePresetName(input.name);
  const skills = validatePresetSkills(input.skills);
  await assertSkillsExist(skills);
  const presets = await listPresets();

  if (presets[name]) {
    throw new SkmError('conflict', `Preset ${name} already exists.`, {
      hint: 'Use `skm preset update <name> <skill...>` to replace its skills.',
    });
  }

  const nextPresets: PresetsMap = { ...presets, [name]: skills };
  await writePresetYaml(nextPresets);
  return { name, skills };
}

export async function updatePresetDefinition(input: { name: string; skills: string[] }): Promise<{ name: string; skills: string[] }> {
  const name = validatePresetName(input.name);
  const skills = validatePresetSkills(input.skills);
  await assertSkillsExist(skills);
  const presets = await listPresets();

  if (!presets[name]) {
    throw new SkmError('config', `Preset ${name} was not found.`, {
      hint: 'Check `skm preset list` to see the available presets.',
    });
  }

  const nextPresets: PresetsMap = { ...presets, [name]: skills };
  await writePresetYaml(nextPresets);
  return { name, skills };
}

export async function deletePresetDefinition(name: string): Promise<{ name: string }> {
  const normalized = validatePresetName(name);
  const presets = await listPresets();

  if (!presets[normalized]) {
    throw new SkmError('config', `Preset ${normalized} was not found.`, {
      hint: 'Check `skm preset list` to see the available presets.',
    });
  }

  const nextPresets: PresetsMap = { ...presets };
  delete nextPresets[normalized];
  await writePresetYaml(nextPresets);
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
  const { config } = await loadConfig();
  const knownSkills = new Set((await listSkills(config.skillsDir)).map((skill) => skill.name));
  const missing = skillNames.filter((skill) => !knownSkills.has(skill));
  if (missing.length === 0) {
    return;
  }

  throw new SkmError('config', `Preset references unknown skill(s): ${missing.join(', ')}.`, {
    details: `Configured skills directory: ${toDisplayPath(config.skillsDir)}.`,
    hint: 'Run `skm skill list` and use only existing skill names in preset definitions.',
  });
}
