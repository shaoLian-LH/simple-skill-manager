import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from '../../src/cli/program.js';
import { FakePromptAdapter } from '../helpers/fake-prompt.js';
import { createSkillFixtures, writePresetsFile } from '../helpers/fixtures.js';
import { initConfigWithSkills } from '../helpers/skm-env.js';
import { withTempDir } from '../helpers/temp.js';

describe('interactive workflows', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  it('supports missing-name inspect via prompt adapter', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [
        {
          dirName: 'brainstorming',
          name: 'brainstorming',
          description: 'Generate many candidate ideas quickly.',
        },
      ]);
      await initConfigWithSkills(homeDir, skillsDir);
      const promptAdapter = new FakePromptAdapter({ selectOne: ['brainstorming'] });

      let stdout = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdout += chunk.toString();
        return true;
      });

      const exitCode = await runCli(['node', 'skm', 'skill', 'inspect'], {
        promptAdapter,
        isInteractiveSession: () => true,
      });

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({ name: 'brainstorming' });
      expect(promptAdapter.calls.selectOne[0]?.choices).toEqual([
        {
          value: 'brainstorming',
          label: 'brainstorming',
          description: 'Generate many candidate ideas quickly.',
        },
      ]);
    });
  });

  it('shows preset skill lists in interactive preset selection prompts', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [
        { dirName: 'brainstorming', name: 'brainstorming' },
        { dirName: 'test-engineer', name: 'test-engineer' },
      ]);
      await initConfigWithSkills(homeDir, skillsDir);

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      await runCli(['node', 'skm', 'preset', 'create', 'frontend-v2', 'brainstorming', 'test-engineer']);

      const promptAdapter = new FakePromptAdapter({ selectOne: ['frontend-v2'] });

      const exitCode = await runCli(['node', 'skm', 'preset', 'inspect'], {
        promptAdapter,
        isInteractiveSession: () => true,
      });

      expect(exitCode).toBe(0);
      expect(promptAdapter.calls.selectOne[0]?.choices).toEqual(
        expect.arrayContaining([
          {
            value: 'frontend-v2',
            label: 'frontend-v2',
            description: '2 skills: brainstorming, test-engineer',
          },
        ]),
      );
    });
  });

  it('shows dynamic scope presets in interactive inspect prompts', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [
        { dirName: 'impeccable/overdrive', name: 'overdrive' },
        { dirName: 'impeccable/polish', name: 'polish' },
      ]);
      await initConfigWithSkills(homeDir, skillsDir);

      const promptAdapter = new FakePromptAdapter({ selectOne: ['impeccable'] });
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const exitCode = await runCli(['node', 'skm', 'preset', 'inspect'], {
        promptAdapter,
        isInteractiveSession: () => true,
      });

      expect(exitCode).toBe(0);
      expect(promptAdapter.calls.selectOne[0]?.choices).toEqual(
        expect.arrayContaining([
          {
            value: 'impeccable',
            label: 'impeccable',
            description: '2 skills: impeccable/overdrive, impeccable/polish · dynamic scope',
          },
        ]),
      );
    });
  });

  it('prints Cancelled and exits with success when interactive command is aborted', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      await runCli(['node', 'skm', 'preset', 'create', 'frontend-v2', 'brainstorming']);

      vi.restoreAllMocks();
      let stdout = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdout += chunk.toString();
        return true;
      });

      const exitCode = await runCli(['node', 'skm', 'preset', 'rm'], {
        promptAdapter: new FakePromptAdapter({
          selectOne: ['frontend-v2'],
          confirm: [false],
        }),
        isInteractiveSession: () => true,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Cancelled.');
    });
  });

  it('short-circuits preset create before prompting when interactive missing-name and no skills exist', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await fs.mkdir(skillsDir, { recursive: true });
      await initConfigWithSkills(homeDir, skillsDir);

      let stdout = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdout += chunk.toString();
        return true;
      });

      const exitCode = await runCli(['node', 'skm', 'preset', 'create'], {
        promptAdapter: new FakePromptAdapter(),
        isInteractiveSession: () => true,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No skills are available to create a preset.');
    });
  });

  it('short-circuits preset update before prompting when interactive missing-name and no skills exist', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await fs.mkdir(skillsDir, { recursive: true });
      await initConfigWithSkills(homeDir, skillsDir);

      let stdout = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdout += chunk.toString();
        return true;
      });

      const exitCode = await runCli(['node', 'skm', 'preset', 'update'], {
        promptAdapter: new FakePromptAdapter(),
        isInteractiveSession: () => true,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No skills are available to update preset definitions.');
    });
  });

  it('describes global target locations in interactive target prompts', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const promptAdapter = new FakePromptAdapter({
        selectMany: [['brainstorming'], ['.gemini']],
        confirm: [false],
      });

      const exitCode = await runCli(['node', 'skm', 'skill', 'on', '--global'], {
        promptAdapter,
        isInteractiveSession: () => true,
      });

      expect(exitCode).toBe(0);
      expect(promptAdapter.calls.selectMany[1]?.choices).toEqual(
        expect.arrayContaining([
          {
            value: '.gemini',
            label: '.gemini',
            description: 'Install into ~/.gemini/commands.',
          },
        ]),
      );
      expect(promptAdapter.calls.confirm[0]?.message).toContain('globally');
    });
  });

  it('preselects explicitly enabled project skills in interactive enable prompts', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const originalCwd = process.cwd();
        process.env.HOME = homeDir;
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);

        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        process.chdir(projectDir);
        try {
          expect(await runCli(['node', 'skm', 'skill', 'on', 'brainstorming', '--target', '.agents'])).toBe(0);

          const promptAdapter = new FakePromptAdapter({
            selectMany: [['brainstorming'], ['.agents']],
            confirm: [false],
          });

          expect(
            await runCli(['node', 'skm', 'skill', 'on'], {
              promptAdapter,
              isInteractiveSession: () => true,
            }),
          ).toBe(0);

          expect(promptAdapter.calls.selectMany[0]?.options?.initial).toEqual(['brainstorming']);
        } finally {
          process.chdir(originalCwd);
        }
      });
    });
  });

  it('does not preselect skills that are only enabled via presets', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const originalCwd = process.cwd();
        process.env.HOME = homeDir;
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await writePresetsFile(
          path.join(homeDir, '.simple-skill-manager', 'presets.yaml'),
          ['frontend-basic:', '  - brainstorming', '  - test-engineer'].join('\n'),
        );

        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        process.chdir(projectDir);
        try {
          expect(await runCli(['node', 'skm', 'preset', 'on', 'frontend-basic', '--target', '.agents'])).toBe(0);

          const promptAdapter = new FakePromptAdapter({
            selectMany: [['brainstorming'], ['.agents']],
            confirm: [false],
          });

          expect(
            await runCli(['node', 'skm', 'skill', 'on'], {
              promptAdapter,
              isInteractiveSession: () => true,
            }),
          ).toBe(0);

          expect(promptAdapter.calls.selectMany[0]?.options?.initial).toEqual([]);
        } finally {
          process.chdir(originalCwd);
        }
      });
    });
  });

  it('preselects explicitly enabled project presets in interactive enable prompts', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const originalCwd = process.cwd();
        process.env.HOME = homeDir;
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
        await initConfigWithSkills(homeDir, skillsDir);
        await writePresetsFile(path.join(homeDir, '.simple-skill-manager', 'presets.yaml'), ['frontend-basic:', '  - brainstorming'].join('\n'));

        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        process.chdir(projectDir);
        try {
          expect(await runCli(['node', 'skm', 'preset', 'on', 'frontend-basic', '--target', '.agents'])).toBe(0);

          const promptAdapter = new FakePromptAdapter({
            selectMany: [['frontend-basic'], ['.agents']],
            confirm: [false],
          });

          expect(
            await runCli(['node', 'skm', 'preset', 'on'], {
              promptAdapter,
              isInteractiveSession: () => true,
            }),
          ).toBe(0);

          expect(promptAdapter.calls.selectMany[0]?.options?.initial).toEqual(['frontend-basic']);
        } finally {
          process.chdir(originalCwd);
        }
      });
    });
  });

  it('preselects explicitly enabled global skills in interactive enable prompts', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      expect(await runCli(['node', 'skm', 'skill', 'on', 'brainstorming', '--global', '--target', '.agents'])).toBe(0);

      const promptAdapter = new FakePromptAdapter({
        selectMany: [['brainstorming'], ['.agents']],
        confirm: [false],
      });

      expect(
        await runCli(['node', 'skm', 'skill', 'on', '--global'], {
          promptAdapter,
          isInteractiveSession: () => true,
        }),
      ).toBe(0);

      expect(promptAdapter.calls.selectMany[0]?.options?.initial).toEqual(['brainstorming']);
    });
  });
});
