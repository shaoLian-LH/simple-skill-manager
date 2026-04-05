import type { Config, ProjectsIndex } from './types.js';

export const APP_DIR_NAME = '.simple-skill-manager';
export const CONFIG_VERSION = 1 as const;
export const STATE_VERSION = 1 as const;
export const GLOBAL_CONFIG_FILE = 'config.json';
export const GLOBAL_PRESETS_FILE = 'presets.yaml';
export const GLOBAL_PROJECTS_FILE = 'projects.json';
export const PROJECT_STATE_DIR = '.skm';
export const PROJECT_STATE_FILE = 'state.json';
export const DEFAULT_SKILLS_SUBDIR = 'skills';
export const DEFAULT_TARGETS = ['.agents'] as const;

export const DEFAULT_PRESETS_YAML = `frontend-basic:\n  - brainstorming\n  - test-engineer\n`;

export function createDefaultConfig(skillsDir: string): Config {
  return {
    version: CONFIG_VERSION,
    skillsDir,
    defaultTargets: [...DEFAULT_TARGETS],
  };
}

export function createDefaultProjectsIndex(): ProjectsIndex {
  return {
    version: CONFIG_VERSION,
    projects: {},
  };
}
