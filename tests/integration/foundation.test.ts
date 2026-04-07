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

  it('accepts a skill description that contains an unquoted colon-space sequence', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      const skillDir = path.join(skillsDir, 'translate-non-zh-article');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: translate-non-zh-article',
          'description: Translate non-Chinese articles with three modes: quick, normal, and refined.',
          'version: 2.0.0',
          '---',
          '',
          '# Translate Non-Zh Article',
        ].join('\n'),
        'utf8',
      );
      await initConfigWithSkills(homeDir, skillsDir);

      const list = await runCli(['skill', 'list'], { env: { HOME: homeDir } });
      const inspect = await runCli(['skill', 'inspect', 'translate-non-zh-article'], { env: { HOME: homeDir } });

      expect(JSON.parse(list.stdout)).toEqual([
        {
          name: 'translate-non-zh-article',
          path: path.join(skillsDir, 'translate-non-zh-article'),
          description: 'Translate non-Chinese articles with three modes: quick, normal, and refined.',
        },
      ]);
      expect(JSON.parse(inspect.stdout)).toMatchObject({
        name: 'translate-non-zh-article',
        description: 'Translate non-Chinese articles with three modes: quick, normal, and refined.',
        frontmatter: {
          name: 'translate-non-zh-article',
          version: '2.0.0',
        },
      });
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
        { name: 'frontend-basic', skillCount: 2, source: 'static', readonly: false },
        { name: 'writing', skillCount: 1, source: 'static', readonly: false },
      ]);
      expect(JSON.parse(inspect.stdout)).toEqual({
        name: 'frontend-basic',
        skills: ['brainstorming', 'test-engineer'],
        source: 'static',
        readonly: false,
      });

      await writePresetsFile(presetsFile, 'frontend-basic: [brainstorming\n');
      const failure = await runCliExpectFailure(['preset', 'list'], { env: { HOME: homeDir } });
      expect(failure.stderr).toContain('invalid YAML');
      expect(failure.stderr).toContain('Repair presets.yaml');
      expect(failure.code).toBe(3);
    });
  });

  it('discovers scoped skills and exposes scope directories as dynamic presets', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [
        { dirName: 'impeccable/overdrive', name: 'overdrive' },
        { dirName: 'impeccable/polish', name: 'polish' },
      ]);
      await initConfigWithSkills(homeDir, skillsDir);

      const skillList = await runCli(['skill', 'list'], { env: { HOME: homeDir } });
      const presetList = await runCli(['preset', 'list'], { env: { HOME: homeDir } });
      const presetInspect = await runCli(['preset', 'inspect', 'impeccable'], { env: { HOME: homeDir } });

      expect(JSON.parse(skillList.stdout)).toEqual([
        {
          name: 'impeccable/overdrive',
          path: path.join(skillsDir, 'impeccable', 'overdrive'),
          description: '',
        },
        {
          name: 'impeccable/polish',
          path: path.join(skillsDir, 'impeccable', 'polish'),
          description: '',
        },
      ]);
      expect(JSON.parse(presetList.stdout)).toEqual(
        expect.arrayContaining([
          { name: 'impeccable', skillCount: 2, source: 'dynamic', readonly: true },
        ]),
      );
      expect(JSON.parse(presetInspect.stdout)).toEqual({
        name: 'impeccable',
        skills: ['impeccable/overdrive', 'impeccable/polish'],
        source: 'dynamic',
        readonly: true,
      });
    });
  });

  it('fails when a static preset name collides with a dynamic scope preset', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'impeccable/overdrive', name: 'overdrive' }]);
      await initConfigWithSkills(homeDir, skillsDir);
      await writePresetsFile(
        path.join(globalAppDir(homeDir), 'presets.yaml'),
        ['impeccable:', '  - impeccable/overdrive'].join('\n'),
      );

      const failure = await runCliExpectFailure(['preset', 'list'], { env: { HOME: homeDir } });
      expect(failure.stderr).toContain('defined both statically and as a dynamic scope preset');
      expect(failure.code).toBe(4);
    });
  });
});
