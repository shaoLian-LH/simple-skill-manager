import { loadConfig } from '../config/service.js';
import { parsePresetYaml, writePresetYaml } from '../config/presets-store.js';
import { SkmError } from '../errors.js';
import type { PresetDefinition, PresetsMap, SkillDefinition } from '../types.js';
import { uniqueSorted } from '../utils/collection.js';

export function toPresetMap(definitions: PresetDefinition[]): PresetsMap {
  return Object.fromEntries(definitions.map((preset) => [preset.name, [...preset.skills]]));
}

export function buildReadonlyPresetError(name: string): SkmError {
  return new SkmError('conflict', `Preset ${name} is a dynamic scope preset and cannot be modified.`, {
    hint: 'Rename or remove the scope directory to change it, or create a different static preset name in `presets.yaml`.',
  });
}

export async function loadStaticPresets(): Promise<PresetsMap> {
  return parsePresetYaml();
}

export async function saveStaticPresets(presets: PresetsMap): Promise<void> {
  await writePresetYaml(presets);
}

export function buildDynamicPresets(skills: SkillDefinition[]): Map<string, string[]> {
  const dynamicPresets = new Map<string, string[]>();

  for (const skill of skills) {
    if (!skill.scopeName) {
      continue;
    }

    const existing = dynamicPresets.get(skill.scopeName) ?? [];
    existing.push(skill.name);
    dynamicPresets.set(skill.scopeName, existing);
  }

  return dynamicPresets;
}

export function mergePresetDefinitions(staticPresets: PresetsMap, dynamicPresets: Map<string, string[]>): PresetDefinition[] {
  for (const name of dynamicPresets.keys()) {
    if (staticPresets[name]) {
      throw new SkmError('conflict', `Preset name ${name} is defined both statically and as a dynamic scope preset.`, {
        hint: 'Rename the preset in `presets.yaml` or rename the scope directory to remove the ambiguity.',
      });
    }
  }

  const staticDefinitions: PresetDefinition[] = Object.entries(staticPresets).map(([name, skills]) => ({
    name,
    skills: uniqueSorted(skills),
    source: 'static',
    readonly: false,
  }));
  const dynamicDefinitions: PresetDefinition[] = Array.from(dynamicPresets.entries()).map(([name, skills]) => ({
    name,
    skills: uniqueSorted(skills),
    source: 'dynamic',
    readonly: true,
  }));

  return [...staticDefinitions, ...dynamicDefinitions].sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadSkillsDir(): Promise<string> {
  const { config } = await loadConfig();
  return config.skillsDir;
}
