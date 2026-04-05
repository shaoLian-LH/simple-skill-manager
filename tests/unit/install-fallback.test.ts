import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { enableSkill } from '../../src/core/activation/service.js';
import { initGlobalConfig, setSkillsDir } from '../../src/core/config/service.js';
import { createSkillFixtures } from '../helpers/fixtures.js';
import { withTempDir } from '../helpers/temp.js';

describe('install fallback', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  it('falls back to copy mode when symlink creation fails and records the result in state', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        process.env.HOME = homeDir;
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);

        await initGlobalConfig();
        await setSkillsDir(skillsDir);

        vi.spyOn(fs, 'symlink').mockRejectedValueOnce(new Error('EPERM'));

        const state = await enableSkill(projectDir, 'brainstorming', ['.agents']);
        const installPath = path.join(projectDir, '.agents', 'skills', 'brainstorming');
        const stats = await fs.lstat(installPath);

        const agentTarget = state.targets['.agents'];
        expect(agentTarget).toBeDefined();
        const brainstormingInstall = agentTarget!.skills.brainstorming;
        expect(brainstormingInstall).toBeDefined();
        expect(brainstormingInstall!.installMode).toBe('copy');
        expect(stats.isDirectory()).toBe(true);
        expect(stats.isSymbolicLink()).toBe(false);
      });
    });
  });
});
