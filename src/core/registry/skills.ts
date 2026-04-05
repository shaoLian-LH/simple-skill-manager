import fs from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

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

interface ParsedSkillMatter {
  data: Record<string, unknown>;
  content: string;
}

function extractFrontmatterBlock(raw: string): { frontmatter: string; content: string } | null {
  const match = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    return null;
  }

  return {
    frontmatter: match[1] ?? '',
    content: raw.slice(match[0].length),
  };
}

function sanitizeYamlFrontmatter(frontmatter: string): string {
  return frontmatter
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*)([A-Za-z0-9_-]+):(.*)$/);
      if (!match) {
        return line;
      }

      const [, indent = '', key = '', remainder = ''] = match;
      const trimmedValue = remainder.trim();
      if (trimmedValue.length === 0) {
        return line;
      }

      if (/^["'[{|>!&*]/.test(trimmedValue)) {
        return line;
      }

      if (!trimmedValue.includes(': ')) {
        return line;
      }

      return `${indent}${key}: ${JSON.stringify(trimmedValue)}`;
    })
    .join('\n');
}

function parseLooseFrontmatter(raw: string, skillFilePath: string, originalError: unknown): ParsedSkillMatter {
  const extracted = extractFrontmatterBlock(raw);
  if (!extracted) {
    throw new SkmError('config', `Skill file ${toDisplayPath(skillFilePath)} has invalid frontmatter.`, {
      details: originalError instanceof Error ? originalError.message : String(originalError),
      hint: 'Fix the YAML frontmatter so `SKILL.md` starts with a valid `---` block.',
      cause: originalError,
    });
  }

  try {
    const parsed = YAML.parse(sanitizeYamlFrontmatter(extracted.frontmatter)) ?? {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Frontmatter must parse to an object.');
    }

    return {
      data: parsed as Record<string, unknown>,
      content: extracted.content,
    };
  } catch {
    throw new SkmError('config', `Skill file ${toDisplayPath(skillFilePath)} has invalid frontmatter.`, {
      details: originalError instanceof Error ? originalError.message : String(originalError),
      hint: 'Quote frontmatter values that contain `: ` or repair the YAML syntax.',
      cause: originalError,
    });
  }
}

function parseSkillMatter(raw: string, skillFilePath: string): ParsedSkillMatter {
  const extracted = extractFrontmatterBlock(raw);
  if (!extracted) {
    return {
      data: {},
      content: raw,
    };
  }

  try {
    const parsed = YAML.parse(extracted.frontmatter) ?? {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Frontmatter must parse to an object.');
    }

    return {
      data: parsed as Record<string, unknown>,
      content: extracted.content,
    };
  } catch (error) {
    return parseLooseFrontmatter(raw, skillFilePath, error);
  }
}

async function readSkillFromDir(dirPath: string): Promise<SkillDefinition | null> {
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
