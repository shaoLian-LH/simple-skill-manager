import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSkillFixtures, writePresetsFile } from '../helpers/fixtures.js';
import { initConfig, initConfigWithSkills } from '../helpers/skm-env.js';
import { withTempDir } from '../helpers/temp.js';
import { runCli, runCliExpectFailure } from '../helpers/cli.js';

function globalAppDir(homeDir: string): string {
  return path.join(homeDir, '.simple-skill-manager');
}

describe('foundation CLI', () => {
  it('initializes global files idempotently', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const first = await runCli(['config', 'init'], { env: { HOME: homeDir } });
      const second = await runCli(['config', 'init'], { env: { HOME: homeDir } });
      const configGet = await runCli(['config', 'get'], { env: { HOME: homeDir } });

      const appDir = globalAppDir(homeDir);
      await expect(fs.access(path.join(appDir, 'config.json'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(appDir, 'presets.yaml'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(appDir, 'projects.json'))).resolves.toBeUndefined();

      const firstJson = JSON.parse(first.stdout) as { created: string[]; skipped: string[] };
      const secondJson = JSON.parse(second.stdout) as { created: string[]; skipped: string[] };
      const configJson = JSON.parse(configGet.stdout) as { skillsDir: string };

      expect(firstJson.created.length).toBeGreaterThan(0);
      expect(secondJson.skipped).toEqual(
        expect.arrayContaining([
          '~/.simple-skill-manager/config.json',
          '~/.simple-skill-manager/presets.yaml',
          '~/.simple-skill-manager/projects.json',
        ]),
      );
      expect(configJson.skillsDir).toBe(path.join(appDir, 'skills'));
    });
  });

  it('lists and inspects skills and reports duplicate frontmatter names', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [
        {
          dirName: 'brainstorming',
          name: 'brainstorming',
          description: 'Generate candidate ideas',
          body: 'Think broadly first.',
        },
      ]);
      await fs.mkdir(path.join(skillsDir, 'ignored-dir'), { recursive: true });
      await initConfigWithSkills(homeDir, skillsDir);

      const list = await runCli(['skill', 'list'], { env: { HOME: homeDir } });
      const inspect = await runCli(['skill', 'inspect', 'brainstorming'], { env: { HOME: homeDir } });

      expect(JSON.parse(list.stdout)).toEqual([
        {
          name: 'brainstorming',
          path: path.join(skillsDir, 'brainstorming'),
          description: 'Generate candidate ideas',
        },
      ]);
      expect(JSON.parse(inspect.stdout)).toMatchObject({
        name: 'brainstorming',
        dirPath: path.join(skillsDir, 'brainstorming'),
        skillFilePath: path.join(skillsDir, 'brainstorming', 'SKILL.md'),
        bodyPreview: 'Think broadly first.',
      });

      await createSkillFixtures(skillsDir, [
        {
          dirName: 'duplicate-brainstorming',
          name: 'brainstorming',
          description: 'Conflict',
        },
      ]);

      const failure = await runCliExpectFailure(['skill', 'list'], { env: { HOME: homeDir } });
      expect(failure.stderr).toContain('Duplicate skill name brainstorming');
      expect(failure.code).toBe(4);
    });
  });

  it('reads preset mappings and fails clearly on invalid yaml', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await initConfig(homeDir);
      const presetsFile = path.join(globalAppDir(homeDir), 'presets.yaml');
      await writePresetsFile(
        presetsFile,
        ['frontend-basic:', '  - brainstorming', '  - test-engineer', 'writing:', '  - translate'].join('\n'),
      );

      const list = await runCli(['preset', 'list'], { env: { HOME: homeDir } });
      const inspect = await runCli(['preset', 'inspect', 'frontend-basic'], { env: { HOME: homeDir } });

      expect(JSON.parse(list.stdout)).toEqual([
        { name: 'frontend-basic', skillCount: 2 },
        { name: 'writing', skillCount: 1 },
      ]);
      expect(JSON.parse(inspect.stdout)).toEqual({
        name: 'frontend-basic',
        skills: ['brainstorming', 'test-engineer'],
      });

      await writePresetsFile(presetsFile, 'frontend-basic: [brainstorming\n');
      const failure = await runCliExpectFailure(['preset', 'list'], { env: { HOME: homeDir } });
      expect(failure.stderr).toContain('invalid YAML');
      expect(failure.stderr).toContain('Repair presets.yaml');
      expect(failure.code).toBe(3);
    });
  });
});
