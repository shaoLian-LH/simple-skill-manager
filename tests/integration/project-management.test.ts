import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSkillFixtures, writePresetsFile } from '../helpers/fixtures.js';
import { initConfigWithSkills, readGlobalState, readProjectState, readProjectsIndex } from '../helpers/skm-env.js';
import { withTempDir } from '../helpers/temp.js';
import { runCli, runCliExpectFailure } from '../helpers/cli.js';

function globalAppDir(homeDir: string): string {
  return path.join(homeDir, '.simple-skill-manager');
}

describe('project activation and maintenance', () => {
  it('enables a skill, mirrors project index, and stays idempotent on rerun', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const resolvedProjectDir = await fs.realpath(projectDir);
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming', description: 'Generate candidate ideas' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);

        await runCli(['skill', 'enable', 'brainstorming', '--target', '.agents'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });
        await runCli(['skill', 'enable', 'brainstorming', '--target', '.agents'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });

        const state = (await readProjectState(projectDir)) as {
          enabledSkills: string[];
          enabledPresets: string[];
          targets: Record<string, { skills: Record<string, { sourcePath: string; installMode: string }> }>;
        };
        const index = (await readProjectsIndex(homeDir)) as {
          projects: Record<string, { targets: string[]; enabledSkills: string[] }>;
        };
        const installPath = path.join(projectDir, '.agents', 'skills', 'brainstorming');
        const installStats = await fs.lstat(installPath);
        const gitignore = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');

        expect(state.enabledSkills).toEqual(['brainstorming']);
        expect(state.enabledPresets).toEqual([]);
        const agentTarget = state.targets['.agents'];
        expect(agentTarget).toBeDefined();
        const brainstormingInstall = agentTarget!.skills.brainstorming;
        expect(brainstormingInstall).toBeDefined();
        expect(brainstormingInstall!.sourcePath).toBe(path.join(skillsDir, 'brainstorming'));
        expect(index.projects[resolvedProjectDir]).toMatchObject({
          targets: ['.agents'],
          enabledSkills: ['brainstorming'],
        });
        expect(installStats.isSymbolicLink() || installStats.isDirectory()).toBe(true);
        expect(gitignore.trim().split(/\r?\n/)).toContain('.skm');
      });
    });
  });

  it('can enable a second skill even when another skill uses loose frontmatter syntax', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'code-review-process', name: 'code-review-process' },
        ]);

        const looseSkillDir = path.join(skillsDir, 'translate-non-zh-article');
        await fs.mkdir(looseSkillDir, { recursive: true });
        await fs.writeFile(
          path.join(looseSkillDir, 'SKILL.md'),
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

        await runCli(['skill', 'enable', 'brainstorming', '--target', '.agents'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });
        await runCli(['skill', 'enable', 'code-review-process', '--target', '.agents'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });

        const state = (await readProjectState(projectDir)) as {
          enabledSkills: string[];
          targets: Record<string, { skills: Record<string, unknown> }>;
        };

        expect(state.enabledSkills).toEqual(['brainstorming', 'code-review-process']);
        expect(Object.keys(state.targets['.agents']!.skills).sort()).toEqual(['brainstorming', 'code-review-process']);
      });
    });
  });

  it('fails when the target path is already occupied by an unknown entry', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const resolvedProjectDir = await fs.realpath(projectDir);
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
        await initConfigWithSkills(homeDir, skillsDir);

        const occupiedPath = path.join(projectDir, '.agents', 'skills', 'brainstorming');
        await fs.mkdir(occupiedPath, { recursive: true });
        await fs.writeFile(path.join(occupiedPath, 'README.txt'), 'occupied', 'utf8');

        const failure = await runCliExpectFailure(['skill', 'enable', 'brainstorming', '--target', '.agents'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });

        expect(failure.stderr).toContain('Target path is already occupied');
        expect(failure.code).toBe(4);
      });
    });
  });

  it('enables presets, preserves preset-referenced skills on disable, and removes stale installs when disabling a preset', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await writePresetsFile(
          path.join(globalAppDir(homeDir), 'presets.yaml'),
          ['frontend-basic:', '  - brainstorming', '  - test-engineer'].join('\n'),
        );

        await runCli(['skill', 'enable', 'brainstorming', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });
        await runCli(['preset', 'enable', 'frontend-basic', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });
        await runCli(['skill', 'disable', 'brainstorming'], { cwd: projectDir, env: { HOME: homeDir } });

        let state = (await readProjectState(projectDir)) as {
          enabledSkills: string[];
          enabledPresets: string[];
          targets: Record<string, { skills: Record<string, unknown> }>;
        };
        expect(state.enabledSkills).toEqual([]);
        expect(state.enabledPresets).toEqual(['frontend-basic']);
        const agentTarget = state.targets['.agents'];
        expect(agentTarget).toBeDefined();
        expect(Object.keys(agentTarget!.skills).sort()).toEqual(['brainstorming', 'test-engineer']);

        await runCli(['preset', 'disable', 'frontend-basic'], { cwd: projectDir, env: { HOME: homeDir } });
        state = (await readProjectState(projectDir)) as {
          enabledSkills: string[];
          enabledPresets: string[];
          targets: Record<string, { skills: Record<string, unknown> }>;
        };

        expect(state.enabledSkills).toEqual([]);
        expect(state.enabledPresets).toEqual([]);
        expect(state.targets).toEqual({});
        await expect(fs.access(path.join(projectDir, '.agents', 'skills', 'brainstorming'))).rejects.toThrow();
        await expect(fs.access(path.join(projectDir, '.agents', 'skills', 'test-engineer'))).rejects.toThrow();
      });
    });
  });

  it('doctor reports missing installs and stale global index, and sync repairs them', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const resolvedProjectDir = await fs.realpath(projectDir);
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await writePresetsFile(
          path.join(globalAppDir(homeDir), 'presets.yaml'),
          ['frontend-basic:', '  - brainstorming', '  - test-engineer'].join('\n'),
        );

        await runCli(['preset', 'enable', 'frontend-basic', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });
        await fs.rm(path.join(projectDir, '.agents', 'skills', 'test-engineer'), { recursive: true, force: true });

        const projectsFile = path.join(globalAppDir(homeDir), 'projects.json');
        const staleIndex = JSON.parse(await fs.readFile(projectsFile, 'utf8')) as { projects: Record<string, unknown> };
        staleIndex.projects[resolvedProjectDir] = {
          targets: ['.trae'],
          enabledSkills: [],
          enabledPresets: [],
          updatedAt: '2000-01-01T00:00:00.000Z',
        };
        await fs.writeFile(projectsFile, `${JSON.stringify(staleIndex, null, 2)}\n`, 'utf8');

        const doctor = await runCli(['doctor'], { cwd: projectDir, env: { HOME: homeDir } });
        const doctorJson = JSON.parse(doctor.stdout) as { ok: boolean; issues: Array<{ type: string }> };
        expect(doctorJson.ok).toBe(false);
        expect(doctorJson.issues.map((issue) => issue.type)).toEqual(
          expect.arrayContaining(['missing-installation', 'stale-global-index']),
        );

        await runCli(['sync'], { cwd: projectDir, env: { HOME: homeDir } });
        const healedDoctor = JSON.parse((await runCli(['doctor'], { cwd: projectDir, env: { HOME: homeDir } })).stdout) as {
          ok: boolean;
          issues: Array<{ type: string }>;
        };

        expect(healedDoctor.ok).toBe(true);
        await expect(fs.access(path.join(projectDir, '.agents', 'skills', 'test-engineer'))).resolves.toBeUndefined();
      });
    });
  });

  it('enables and disables dynamic scope presets with scoped skill installs', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'impeccable/overdrive', name: 'overdrive' },
          { dirName: 'impeccable/polish', name: 'polish' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);

        await runCli(['preset', 'enable', 'impeccable', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

        let state = (await readProjectState(projectDir)) as {
          enabledPresets: string[];
          targets: Record<string, { skills: Record<string, unknown> }>;
        };

        expect(state.enabledPresets).toEqual(['impeccable']);
        expect(Object.keys(state.targets['.agents']!.skills).sort()).toEqual(['impeccable/overdrive', 'impeccable/polish']);
        await expect(fs.access(path.join(projectDir, '.agents', 'skills', 'impeccable', 'overdrive'))).resolves.toBeUndefined();
        await expect(fs.access(path.join(projectDir, '.agents', 'skills', 'impeccable', 'polish'))).resolves.toBeUndefined();

        await runCli(['preset', 'disable', 'impeccable'], { cwd: projectDir, env: { HOME: homeDir } });
        state = (await readProjectState(projectDir)) as {
          enabledPresets: string[];
          targets: Record<string, { skills: Record<string, unknown> }>;
        };

        expect(state.enabledPresets).toEqual([]);
        expect(state.targets).toEqual({});
        await expect(fs.access(path.join(projectDir, '.agents', 'skills', 'impeccable'))).rejects.toThrow();
      });
    });
  });

  it('treats dynamic presets as valid definitions during doctor and sync', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'impeccable/overdrive', name: 'overdrive' },
          { dirName: 'impeccable/polish', name: 'polish' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['preset', 'enable', 'impeccable', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

        const initialDoctor = JSON.parse((await runCli(['doctor'], { cwd: projectDir, env: { HOME: homeDir } })).stdout) as {
          ok: boolean;
        };
        expect(initialDoctor.ok).toBe(true);

        await fs.rm(path.join(projectDir, '.agents', 'skills', 'impeccable', 'polish'), { recursive: true, force: true });
        await runCli(['sync'], { cwd: projectDir, env: { HOME: homeDir } });

        const healedDoctor = JSON.parse((await runCli(['doctor'], { cwd: projectDir, env: { HOME: homeDir } })).stdout) as {
          ok: boolean;
          issues: Array<{ type: string }>;
        };
        expect(healedDoctor.ok).toBe(true);
        expect(healedDoctor.issues).toEqual([]);
        await expect(fs.access(path.join(projectDir, '.agents', 'skills', 'impeccable', 'polish'))).resolves.toBeUndefined();
      });
    });
  });

  it('enables and disables skills in global scope without touching projects index', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      await runCli(['skill', 'enable', 'brainstorming', '--global', '--target', '.agents'], {
        env: { HOME: homeDir },
      });

      let globalState = (await readGlobalState(homeDir)) as {
        enabledSkills: string[];
        enabledPresets: string[];
        targets: Record<string, { skills: Record<string, { installMode: string; sourcePath: string }> }>;
      };
      const installPath = path.join(homeDir, '.agents', 'skills', 'brainstorming');
      const installStats = await fs.lstat(installPath);
      const projectsIndex = (await readProjectsIndex(homeDir)) as { projects: Record<string, unknown> };

      expect(globalState.enabledSkills).toEqual(['brainstorming']);
      expect(globalState.enabledPresets).toEqual([]);
      expect(globalState.targets['.agents']?.skills.brainstorming).toMatchObject({
        installMode: expect.stringMatching(/^(symlink|copy)$/),
        sourcePath: path.join(skillsDir, 'brainstorming'),
      });
      expect(Object.keys(projectsIndex.projects)).toEqual([]);
      expect(installStats.isSymbolicLink() || installStats.isDirectory()).toBe(true);

      await runCli(['skill', 'disable', 'brainstorming', '--global'], {
        env: { HOME: homeDir },
      });

      globalState = (await readGlobalState(homeDir)) as {
        enabledSkills: string[];
        enabledPresets: string[];
        targets: Record<string, unknown>;
      };
      expect(globalState.enabledSkills).toEqual([]);
      expect(globalState.enabledPresets).toEqual([]);
      expect(globalState.targets).toEqual({});
      await expect(fs.access(installPath)).rejects.toThrow();
    });
  });

  it('projects scoped skills into gemini commands for project and global scope', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          {
            dirName: 'impeccable/polish',
            name: 'polish',
            description: 'Refine surface details.',
            body: ['# Polish Mode', 'Use the exact brand voice.'].join('\n'),
          },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);

        await runCli(['skill', 'enable', 'impeccable/polish', '--target', '.gemini'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });
        await runCli(['skill', 'enable', 'impeccable/polish', '--global', '--target', '.gemini'], {
          env: { HOME: homeDir },
        });

        const projectState = (await readProjectState(projectDir)) as {
          targets: Record<string, { skills: Record<string, { installMode: string }> }>;
        };
        const globalState = (await readGlobalState(homeDir)) as {
          targets: Record<string, { skills: Record<string, { installMode: string }> }>;
        };
        const expectedToml = `description = ${JSON.stringify('Refine surface details.')}\nprompt = ${JSON.stringify('# Polish Mode\nUse the exact brand voice.')}\n`;
        const projectTomlPath = path.join(projectDir, '.gemini', 'commands', 'impeccable', 'polish.toml');
        const globalTomlPath = path.join(homeDir, '.gemini', 'commands', 'impeccable', 'polish.toml');

        expect(projectState.targets['.gemini']?.skills['impeccable/polish']?.installMode).toBe('generated');
        expect(globalState.targets['.gemini']?.skills['impeccable/polish']?.installMode).toBe('generated');
        expect(await fs.readFile(projectTomlPath, 'utf8')).toBe(expectedToml);
        expect(await fs.readFile(globalTomlPath, 'utf8')).toBe(expectedToml);
      });
    });
  });

  it('reports and repairs missing global installations via doctor and sync', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
      await initConfigWithSkills(homeDir, skillsDir);

      await runCli(['skill', 'enable', 'brainstorming', '--global', '--target', '.agents'], {
        env: { HOME: homeDir },
      });
      await fs.rm(path.join(homeDir, '.agents', 'skills', 'brainstorming'), { recursive: true, force: true });

      const doctor = await runCli(['doctor', '--global'], { env: { HOME: homeDir } });
      const doctorJson = JSON.parse(doctor.stdout) as { ok: boolean; issues: Array<{ type: string }> };
      expect(doctorJson.ok).toBe(false);
      expect(doctorJson.issues.map((issue) => issue.type)).toEqual(expect.arrayContaining(['missing-installation']));

      await runCli(['sync', '--global'], { env: { HOME: homeDir } });
      const healedDoctor = JSON.parse((await runCli(['doctor', '--global'], { env: { HOME: homeDir } })).stdout) as {
        ok: boolean;
        issues: Array<{ type: string }>;
      };

      expect(healedDoctor.ok).toBe(true);
      await expect(fs.access(path.join(homeDir, '.agents', 'skills', 'brainstorming'))).resolves.toBeUndefined();
    });
  });
});
