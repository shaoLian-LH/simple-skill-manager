import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli, runCliExpectFailure } from '../helpers/cli.js';
import { createSkillFixtures } from '../helpers/fixtures.js';
import { initConfigWithSkills, readProjectState } from '../helpers/skm-env.js';
import { withTempDir } from '../helpers/temp.js';

describe('v2 CLI roadmap', () => {
  it('removes top-level enable/disable command entry points', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const failure = await runCliExpectFailure(['enable', 'skill', 'brainstorming'], {
        env: { HOME: homeDir },
      });
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('unknown command');
    });
  });

  it('supports batch skill and preset operations through resource command families', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
          { dirName: 'code-review-process', name: 'code-review-process' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);

        await runCli(['preset', 'create', 'frontend-v2', 'brainstorming', 'test-engineer'], { env: { HOME: homeDir } });
        await runCli(['skill', 'enable', 'brainstorming', 'code-review-process', '--target', '.agents'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });
        await runCli(['preset', 'enable', 'frontend-v2', '--target', '.agents'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });
        await runCli(['skill', 'disable', 'brainstorming', 'code-review-process'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });
        const state = (await readProjectState(projectDir)) as {
          enabledSkills: string[];
          enabledPresets: string[];
          targets: Record<string, { skills: Record<string, unknown> }>;
        };

        expect(state.enabledSkills).toEqual([]);
        expect(state.enabledPresets).toEqual(['frontend-v2']);
        expect(Object.keys(state.targets['.agents']!.skills).sort()).toEqual(['brainstorming', 'test-engineer']);
      });
    });
  });

  it('fails missing required names in non-tty mode', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      const inspectFailure = await runCliExpectFailure(['skill', 'inspect'], { env: { HOME: homeDir } });
      expect(inspectFailure.code).toBe(2);
      expect(inspectFailure.stderr).toContain('Skill name is required in non-interactive mode');

      const createFailure = await runCliExpectFailure(['preset', 'create'], { env: { HOME: homeDir } });
      expect(createFailure.code).toBe(2);
      expect(createFailure.stderr).toContain('Preset name is required in non-interactive mode');
    });
  });

  it('prints empty-state messages for inspect/update/delete when nothing is selectable', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await fs.mkdir(skillsDir, { recursive: true });
      await initConfigWithSkills(homeDir, skillsDir);

      const skillInspect = await runCli(['skill', 'inspect'], { env: { HOME: homeDir } });
      expect(skillInspect.stdout).toContain('No skills are available to inspect.');

      await runCli(['preset', 'delete', 'frontend-basic'], { env: { HOME: homeDir } });
      const presetInspect = await runCli(['preset', 'inspect'], { env: { HOME: homeDir } });
      expect(presetInspect.stdout).toContain('No presets are available to inspect.');

      const presetUpdate = await runCli(['preset', 'update'], { env: { HOME: homeDir } });
      expect(presetUpdate.stdout).toContain('No skills are available to update preset definitions.');

      const presetDelete = await runCli(['preset', 'delete'], { env: { HOME: homeDir } });
      expect(presetDelete.stdout).toContain('No presets are available to delete.');
    });
  });

  it('short-circuits no-skill interactive-style flows with explicit empty-state messages', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await fs.mkdir(skillsDir, { recursive: true });
      await initConfigWithSkills(homeDir, skillsDir);

      const skillEnable = await runCli(['skill', 'enable'], { env: { HOME: homeDir } });
      expect(skillEnable.stdout).toContain('No skills are available to enable.');

      const presetCreate = await runCli(['preset', 'create', 'frontend-v2'], { env: { HOME: homeDir } });
      expect(presetCreate.stdout).toContain('No skills are available to create a preset.');

      const presetUpdate = await runCli(['preset', 'update', 'frontend-v2'], { env: { HOME: homeDir } });
      expect(presetUpdate.stdout).toContain('No skills are available to update preset definitions.');
    });
  });

  it('rejects preset create/update when parameter-mode skill names do not exist', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      const createFailure = await runCliExpectFailure(['preset', 'create', 'frontend-v2', 'missing-skill'], { env: { HOME: homeDir } });
      expect(createFailure.code).toBe(3);
      expect(createFailure.stderr).toContain('Preset references unknown skill(s): missing-skill.');

      await runCli(['preset', 'create', 'frontend-v2', 'brainstorming'], { env: { HOME: homeDir } });
      const updateFailure = await runCliExpectFailure(['preset', 'update', 'frontend-v2', 'missing-skill'], { env: { HOME: homeDir } });
      expect(updateFailure.code).toBe(3);
      expect(updateFailure.stderr).toContain('Preset references unknown skill(s): missing-skill.');
    });
  });

  it('supports preset CRUD and reports missing preset drift in doctor/sync', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);

        await runCli(['preset', 'create', 'frontend-v2', 'brainstorming', 'test-engineer'], { env: { HOME: homeDir } });
        await runCli(['preset', 'update', 'frontend-v2', 'brainstorming'], { env: { HOME: homeDir } });
        const inspect = await runCli(['preset', 'inspect', 'frontend-v2'], { env: { HOME: homeDir } });
        expect(JSON.parse(inspect.stdout)).toEqual({ name: 'frontend-v2', skills: ['brainstorming'], source: 'static', readonly: false });

        await runCli(['preset', 'enable', 'frontend-v2', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });
        const deleted = await runCli(['preset', 'delete', 'frontend-v2'], { env: { HOME: homeDir } });
        expect(JSON.parse(deleted.stdout)).toMatchObject({ name: 'frontend-v2', deleted: true, referencedProjects: 1 });
        expect(deleted.stderr).toContain('Warning: Preset frontend-v2 is still referenced');

        const doctor = await runCli(['doctor'], { cwd: projectDir, env: { HOME: homeDir } });
        const doctorJson = JSON.parse(doctor.stdout) as { ok: boolean; issues: Array<{ type: string; presetName?: string }> };
        expect(doctorJson.ok).toBe(false);
        expect(doctorJson.issues).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'missing-preset-definition', presetName: 'frontend-v2' })]),
        );

        const syncFailure = await runCliExpectFailure(['sync'], { cwd: projectDir, env: { HOME: homeDir } });
        expect(syncFailure.code).toBe(3);
        expect(syncFailure.stderr).toContain('Preset definitions are missing');

        await runCli(['preset', 'disable', 'frontend-v2'], { cwd: projectDir, env: { HOME: homeDir } });
        const finalState = JSON.parse(await fs.readFile(path.join(projectDir, '.skm', 'state.json'), 'utf8')) as {
          enabledPresets: string[];
        };
        expect(finalState.enabledPresets).toEqual([]);
      });
    });
  });

  it('rejects CRUD operations against dynamic scope presets', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [
        { dirName: 'impeccable/overdrive', name: 'overdrive' },
        { dirName: 'impeccable/polish', name: 'polish' },
      ]);
      await initConfigWithSkills(homeDir, skillsDir);

      const updateFailure = await runCliExpectFailure(['preset', 'update', 'impeccable', 'impeccable/overdrive'], { env: { HOME: homeDir } });
      expect(updateFailure.code).toBe(4);
      expect(updateFailure.stderr).toContain('dynamic scope preset and cannot be modified');

      const deleteFailure = await runCliExpectFailure(['preset', 'delete', 'impeccable'], { env: { HOME: homeDir } });
      expect(deleteFailure.code).toBe(4);
      expect(deleteFailure.stderr).toContain('dynamic scope preset and cannot be modified');
    });
  });

  it('rejects removed preset add command', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const failure = await runCliExpectFailure(['preset', 'add', 'frontend-v2', 'brainstorming'], {
        env: { HOME: homeDir },
      });
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('unknown command');
    });
  });
});
