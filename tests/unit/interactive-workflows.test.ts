import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from '../../src/cli/program.js';
import { FakePromptAdapter } from '../helpers/fake-prompt.js';
import { createSkillFixtures } from '../helpers/fixtures.js';
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
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      let stdout = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdout += chunk.toString();
        return true;
      });

      const exitCode = await runCli(['node', 'skm', 'skill', 'inspect'], {
        promptAdapter: new FakePromptAdapter({ selectOne: ['brainstorming'] }),
        isInteractiveSession: () => true,
      });

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({ name: 'brainstorming' });
    });
  });

  it('prints Cancelled and exits with success when interactive command is aborted', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      process.env.HOME = homeDir;
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      await runCli(['node', 'skm', 'preset', 'add', 'frontend-v2', 'brainstorming']);

      vi.restoreAllMocks();
      let stdout = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdout += chunk.toString();
        return true;
      });

      const exitCode = await runCli(['node', 'skm', 'preset', 'delete'], {
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

  it('short-circuits preset add before prompting when interactive missing-name and no skills exist', async () => {
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

      const exitCode = await runCli(['node', 'skm', 'preset', 'add'], {
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
});
