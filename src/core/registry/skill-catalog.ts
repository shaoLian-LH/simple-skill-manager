import fs from 'node:fs/promises';
import path from 'node:path';

import { SkmError } from '../errors.js';
import type { SkillDefinition } from '../types.js';
import { toDisplayPath } from '../utils/path.js';
import { normalizeDescription, parseSkillMatter } from './skill-frontmatter.js';

export async function readSkillFromDir(dirPath: string): Promise<SkillDefinition | null> {
  const skillFilePath = path.join(dirPath, 'SKILL.md');

  let raw: string;
  try {
    raw = await fs.readFile(skillFilePath, 'utf8');
  } catch {
    return null;
  }

  const parsed = parseSkillMatter(raw, skillFilePath);
  const name = parsed.data.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new SkmError('config', `Skill file ${toDisplayPath(skillFilePath)} is missing a frontmatter \`name\`.`, {
      hint: 'Add a unique string `name` field to the SKILL.md frontmatter.',
    });
  }

  const normalizedName = name.trim();
  return {
    name: normalizedName,
    localName: normalizedName,
    scopeName: null,
    description: normalizeDescription(parsed.data),
    dirPath,
    skillFilePath,
    frontmatter: parsed.data,
    body: parsed.content,
  };
}

export function createScopedSkillDefinition(skill: SkillDefinition, scopeName: string): SkillDefinition {
  const normalizedScope = scopeName.trim();
  const normalizedLocalName = skill.localName.trim();

  if (normalizedScope.length === 0 || normalizedLocalName.length === 0) {
    throw new SkmError('config', `Scoped skill at ${toDisplayPath(skill.dirPath)} is missing a valid scope or name.`, {
      hint: 'Ensure the scope directory name and skill frontmatter `name` are both non-empty.',
    });
  }

  return {
    ...skill,
    name: `${normalizedScope}/${normalizedLocalName}`,
    localName: normalizedLocalName,
    scopeName: normalizedScope,
  };
}

export function assertUniqueSkillName(seen: Map<string, string>, skill: SkillDefinition): void {
  const existingPath = seen.get(skill.name);
  if (existingPath) {
    throw new SkmError(
      'conflict',
      `Duplicate skill name ${skill.name} was found in ${toDisplayPath(existingPath)} and ${toDisplayPath(skill.dirPath)}.`,
      {
        hint: 'Rename one of the conflicting skill frontmatter names so every skill name is unique.',
      },
    );
  }

  seen.set(skill.name, skill.dirPath);
}

async function readDirectoryEntries(dirPath: string, directoryLabel: string): Promise<import('node:fs').Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    throw new SkmError('config', `${directoryLabel} cannot be read: ${toDisplayPath(dirPath)}.`, {
      details: error instanceof Error ? error.message : undefined,
      hint: 'Check the configured skillsDir path and directory permissions.',
      cause: error,
    });
  }
}

async function collectScopedSkills(scopeDirPath: string, scopeName: string, seen: Map<string, string>): Promise<SkillDefinition[]> {
  const childEntries = await readDirectoryEntries(scopeDirPath, 'Skill scope directory');
  const skills: SkillDefinition[] = [];

  for (const childEntry of childEntries) {
    if (!childEntry.isDirectory()) {
      continue;
    }

    const childDirPath = path.join(scopeDirPath, childEntry.name);
    const childSkill = await readSkillFromDir(childDirPath);
    if (!childSkill) {
      continue;
    }

    const scopedSkill = createScopedSkillDefinition(childSkill, scopeName);
    assertUniqueSkillName(seen, scopedSkill);
    skills.push(scopedSkill);
  }

  return skills;
}

export async function listDiscoveredSkills(skillsDir: string): Promise<SkillDefinition[]> {
  const entries = await readDirectoryEntries(skillsDir, 'Skills directory');
  const skills: SkillDefinition[] = [];
  const seen = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirPath = path.join(skillsDir, entry.name);
    const directSkill = await readSkillFromDir(dirPath);
    if (directSkill) {
      assertUniqueSkillName(seen, directSkill);
      skills.push(directSkill);
      continue;
    }

    skills.push(...(await collectScopedSkills(dirPath, entry.name, seen)));
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}
