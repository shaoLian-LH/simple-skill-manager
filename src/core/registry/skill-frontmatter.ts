import YAML from 'yaml';

import { SkmError } from '../errors.js';
import { toDisplayPath } from '../utils/path.js';

export interface ParsedSkillMatter {
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

export function normalizeDescription(frontmatter: Record<string, unknown>): string {
  const candidate = frontmatter.description;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

export function createBodyPreview(body: string): string {
  return body
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 6)
    .join('\n');
}

export function parseSkillMatter(raw: string, skillFilePath: string): ParsedSkillMatter {
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
