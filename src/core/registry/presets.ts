import type { PresetsMap } from '../types.js';
import { parsePresetYaml } from '../config/service.js';
import { SkmError } from '../errors.js';

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
