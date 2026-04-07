import fs from 'node:fs/promises';
import path from 'node:path';

import { runCli } from './cli.js';

export async function initConfig(homeDir: string): Promise<void> {
  await runCli(['config', 'init'], { env: { HOME: homeDir } });
}

export async function setSkillsDir(homeDir: string, skillsDir: string): Promise<void> {
  await runCli(['config', 'set', 'skills-dir', skillsDir], { env: { HOME: homeDir } });
}

export async function initConfigWithSkills(homeDir: string, skillsDir: string): Promise<void> {
  await initConfig(homeDir);
  await setSkillsDir(homeDir, skillsDir);
}

export async function readProjectState(projectPath: string): Promise<unknown> {
  const filePath = path.join(projectPath, '.skm', 'state.json');
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
}

export async function readProjectsIndex(homeDir: string): Promise<unknown> {
  const filePath = path.join(homeDir, '.simple-skill-manager', 'projects.json');
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
}

export async function readGlobalState(homeDir: string): Promise<unknown> {
  const filePath = path.join(homeDir, '.simple-skill-manager', 'global-state.json');
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
}
