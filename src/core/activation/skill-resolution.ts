import { SkmError } from '../errors.js';
import { getSkillByName } from '../registry/skills.js';
import type { SkillDefinition } from '../types.js';
import { uniqueSorted } from '../utils/collection.js';

function collectMissingPresetNames(presetNames: string[], presets: Record<string, string[]>): string[] {
  return uniqueSorted(presetNames.filter((name) => !presets[name]));
}

export function assertNoMissingPresetDefinitions(presetNames: string[], presets: Record<string, string[]>, operation: string): void {
  const missing = collectMissingPresetNames(presetNames, presets);
  if (missing.length === 0) {
    return;
  }

  throw new SkmError('config', `Preset definitions are missing for ${missing.join(', ')}.`, {
    details: `Failed while ${operation}.`,
    hint: `Recreate the missing presets or run \`skm preset off ${missing.join(' ')}\` in this scope.`,
  });
}

export async function resolveSkills(skillsDir: string, names: string[]): Promise<Map<string, SkillDefinition>> {
  const resolved = new Map<string, SkillDefinition>();
  for (const name of uniqueSorted(names)) {
    resolved.set(name, await getSkillByName(skillsDir, name));
  }
  return resolved;
}

export async function resolveKnownSkills(skillsDir: string, names: string[]): Promise<Map<string, SkillDefinition>> {
  const resolved = new Map<string, SkillDefinition>();

  for (const name of uniqueSorted(names)) {
    try {
      resolved.set(name, await getSkillByName(skillsDir, name));
    } catch {
      continue;
    }
  }

  return resolved;
}

export function expandPresetSkillsFromMap(presetNames: string[], presets: Record<string, string[]>): string[] {
  const skillNames: string[] = [];
  for (const presetName of presetNames) {
    const preset = presets[presetName];
    if (preset) {
      skillNames.push(...preset);
    }
  }
  return uniqueSorted(skillNames);
}
