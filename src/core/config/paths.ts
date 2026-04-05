import os from 'node:os';
import path from 'node:path';

import {
  APP_DIR_NAME,
  DEFAULT_SKILLS_SUBDIR,
  GLOBAL_CONFIG_FILE,
  GLOBAL_PRESETS_FILE,
  GLOBAL_PROJECTS_FILE,
} from '../constants.js';

export interface GlobalPaths {
  appDir: string;
  configFile: string;
  presetsFile: string;
  projectsFile: string;
  skillsDir: string;
  defaultSkillsDir: string;
}

export function getGlobalPaths(homeDir = os.homedir()): GlobalPaths {
  const appDir = path.join(homeDir, APP_DIR_NAME);

  return {
    appDir,
    configFile: path.join(appDir, GLOBAL_CONFIG_FILE),
    presetsFile: path.join(appDir, GLOBAL_PRESETS_FILE),
    projectsFile: path.join(appDir, GLOBAL_PROJECTS_FILE),
    skillsDir: path.join(appDir, DEFAULT_SKILLS_SUBDIR),
    defaultSkillsDir: path.join(appDir, DEFAULT_SKILLS_SUBDIR),
  };
}
