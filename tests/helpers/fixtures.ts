import fs from 'node:fs/promises';
import path from 'node:path';

export interface SkillFixtureInput {
  dirName: string;
  name: string;
  description?: string;
  body?: string;
  extraFrontmatter?: Record<string, unknown>;
}

export async function createSkillFixtures(skillsDir: string, fixtures: SkillFixtureInput[]): Promise<void> {
  await fs.mkdir(skillsDir, { recursive: true });

  for (const fixture of fixtures) {
    const skillDir = path.join(skillsDir, fixture.dirName);
    await fs.mkdir(skillDir, { recursive: true });

    const frontmatter = {
      name: fixture.name,
      ...(fixture.description ? { description: fixture.description } : {}),
      ...(fixture.extraFrontmatter ?? {}),
    };

    const frontmatterLines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
    const content = ['---', ...frontmatterLines, '---', '', fixture.body ?? `# ${fixture.name}`].join('\n');
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), `${content}\n`, 'utf8');
  }
}

export async function writePresetsFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}
