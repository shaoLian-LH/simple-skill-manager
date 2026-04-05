import fs from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';

import { SkmError } from '../errors.js';
import type { SkillDefinition } from '../types.js';
import { toDisplayPath } from '../utils/path.js';

function normalizeDescription(frontmatter: Record<string, unknown>): string {
  const candidate = frontmatter.description;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function createBodyPreview(body: string): string {
  return body
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 6)
    .join('\n');
}

async function readSkillFromDir(dirPath: string): Promise<SkillDefinition | null> {
  const skillFilePath = path.join(dirPath, 'SKILL.md');

  let raw: string;
  try {
    raw = await fs.readFile(skillFilePath, 'utf8');
  } catch {
    return null;
  }

  const parsed = matter(raw);
  const name = parsed.data.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new SkmError('config', `Skill file ${toDisplayPath(skillFilePath)} is missing a frontmatter \`name\`.`, {
      hint: 'Add a unique string `name` field to the SKILL.md frontmatter.',
    });
  }

  return {
    name: name.trim(),
    description: normalizeDescription(parsed.data),
    dirPath,
    skillFilePath,
    frontmatter: parsed.data,
    body: parsed.content,
  };
}

export async function listSkills(skillsDir: string): Promise<SkillDefinition[]> {
  let entries;
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch (error) {
    throw new SkmError('config', `Skills directory cannot be read: ${toDisplayPath(skillsDir)}.`, {
      details: error instanceof Error ? error.message : undefined,
      hint: 'Check the configured skillsDir path with `skm config get`.',
      cause: error,
    });
  }

  const skills: SkillDefinition[] = [];
  const seen = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirPath = path.join(skillsDir, entry.name);
    const skill = await readSkillFromDir(dirPath);
    if (!skill) {
      continue;
    }

    const existingPath = seen.get(skill.name);
    if (existingPath) {
      throw new SkmError('conflict', `Duplicate skill name ${skill.name} was found in ${toDisplayPath(existingPath)} and ${toDisplayPath(dirPath)}.`, {
        hint: 'Rename one of the conflicting skill frontmatter names so every skill name is unique.',
      });
    }

    seen.set(skill.name, dirPath);
    skills.push(skill);
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getSkillByName(skillsDir: string, skillName: string): Promise<SkillDefinition> {
  const skills = await listSkills(skillsDir);
  const match = skills.find((skill) => skill.name === skillName);

  if (!match) {
    throw new SkmError('config', `Skill ${skillName} was not found in ${toDisplayPath(skillsDir)}.`, {
      hint: 'Check `skm skill list` to see the available skills.',
    });
  }

  return match;
}

export function toSkillInspectView(skill: SkillDefinition): Record<string, unknown> {
  return {
    name: skill.name,
    description: skill.description,
    dirPath: skill.dirPath,
    skillFilePath: skill.skillFilePath,
    frontmatter: skill.frontmatter,
    bodyPreview: createBodyPreview(skill.body),
  };
}
