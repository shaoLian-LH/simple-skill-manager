import { SkmError } from '../errors.js';
import type { SkillDefinition } from '../types.js';
import { toDisplayPath } from '../utils/path.js';

import { createBodyPreview } from './skill-frontmatter.js';
import { listDiscoveredSkills } from './skill-catalog.js';

export async function listSkills(skillsDir: string): Promise<SkillDefinition[]> {
  return listDiscoveredSkills(skillsDir);
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
