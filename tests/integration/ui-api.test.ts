import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createSkillFixtures } from '../helpers/fixtures.js';
import { runCli } from '../helpers/cli.js';
import { initConfigWithSkills } from '../helpers/skm-env.js';
import { withTempDir } from '../helpers/temp.js';
import { UiFacade } from '../../src/ui/facade/service.js';
import { loadConfig } from '../../src/core/config/service.js';
import { loadGlobalState } from '../../src/core/state/global-state.js';
import { startUiServer } from '../../src/ui/server/server.js';

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error?: {
    kind: string;
    message: string;
    fieldErrors?: Record<string, string>;
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<{ status: number; body: ApiEnvelope<T> }> {
  const response = await fetch(url, init);
  const body = (await response.json()) as ApiEnvelope<T>;
  return { status: response.status, body };
}

describe.sequential('ui API integration', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('serves read APIs and preserves projectId compatibility behavior', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
          { dirName: 'impeccable/overdrive', name: 'overdrive' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['preset', 'create', 'frontend-v1', 'brainstorming', 'test-engineer'], { env: { HOME: homeDir } });
        await runCli(['skill', 'on', 'brainstorming', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });
        await runCli(['preset', 'on', 'frontend-v1', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

        process.env.HOME = homeDir;
        const server = await startUiServer({ preferredPort: 0, launchCwd: projectDir });
        try {
          const baseUrl = server.launchStatus.url;

          const bootResponse = await requestJson<{
            initialRoute: string;
            launchCwd: string;
            matchedProjectId: string | null;
          }>(`${baseUrl}/api/boot`);
          expect(bootResponse.status).toBe(200);
          expect(bootResponse.body.ok).toBe(true);
          expect(bootResponse.body.data.matchedProjectId).toEqual(expect.any(String));
          expect(bootResponse.body.data.initialRoute).toBe(
            `/projects/${encodeURIComponent(bootResponse.body.data.matchedProjectId ?? '')}`,
          );

          const projectsResponse = await requestJson<
            Array<{ projectId: string; enabledSkillCount: number; enabledPresetCount: number }>
          >(`${baseUrl}/api/projects`);
          expect(projectsResponse.status).toBe(200);
          expect(projectsResponse.body.ok).toBe(true);
          const project = projectsResponse.body.data[0];
          expect(project).toBeDefined();
          expect(project?.enabledSkillCount).toBe(1);
          expect(project?.enabledPresetCount).toBe(1);

          const detailResponse = await requestJson<{
            projectPath: string;
            enabledPresets: Array<{ name: string; source: string; readonly: boolean }>;
            enabledSkills: string[];
            resolvedSkills: Array<{ name: string; direct: boolean; viaPresets: string[]; sourceLabels: string[] }>;
          }>(`${baseUrl}/api/projects/${encodeURIComponent(project!.projectId)}`);
          expect(detailResponse.status).toBe(200);
          expect(detailResponse.body.ok).toBe(true);
          expect(detailResponse.body.data.projectPath).toBe(await fs.realpath(projectDir));
          expect(detailResponse.body.data.enabledPresets).toEqual([
            expect.objectContaining({ name: 'frontend-v1', source: 'static', readonly: false }),
          ]);
          expect(detailResponse.body.data.enabledSkills).toEqual(['brainstorming']);
          expect(detailResponse.body.data.resolvedSkills).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'brainstorming',
                direct: true,
                viaPresets: ['frontend-v1'],
              }),
            ]),
          );

          const malformedProjectResponse = await requestJson<unknown>(`${baseUrl}/api/projects/not-a-valid-id`);
          expect(malformedProjectResponse.status).toBe(400);
          expect(malformedProjectResponse.body.ok).toBe(false);
          expect(malformedProjectResponse.body.error).toMatchObject({ kind: 'usage' });

          const presetsResponse = await requestJson<{
            items: Array<{ name: string; source: string; readonly: boolean }>;
            quickActions: Array<{ id: string; command: string }>;
          }>(
            `${baseUrl}/api/presets`,
          );
          expect(presetsResponse.status).toBe(200);
          expect(presetsResponse.body.ok).toBe(true);
          expect(presetsResponse.body.data.quickActions.length).toBeGreaterThan(0);
          expect(presetsResponse.body.data.quickActions[0]).toMatchObject({
            id: expect.any(String),
            command: expect.any(String),
          });
          expect(presetsResponse.body.data.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ name: 'frontend-v1', source: 'static', readonly: false }),
            ]),
          );

          const configResponse = await requestJson<{
            skillsDir: string;
            supportedTargets: string[];
            quickActions: Array<{ id: string; command: string }>;
            folderPicker: { supported: boolean; mode: string };
          }>(`${baseUrl}/api/config`);
          expect(configResponse.status).toBe(200);
          expect(configResponse.body.ok).toBe(true);
          expect(configResponse.body.data.supportedTargets).toEqual(
            expect.arrayContaining(['.agents', '.trae', '.kiro', '.claude', '.gemini']),
          );
          expect(configResponse.body.data.quickActions.length).toBeGreaterThan(0);
          expect(configResponse.body.data.quickActions[0]).toMatchObject({
            id: expect.any(String),
            command: expect.any(String),
          });
          expect(configResponse.body.data.folderPicker).toMatchObject({
            supported: expect.any(Boolean),
            mode: expect.stringMatching(/host|manual-only/),
          });
          expect(configResponse.body.data).not.toHaveProperty('chooseFolderEndpoint');
          expect(configResponse.body.data.folderPicker).not.toHaveProperty('endpoint');

          const skillsResponse = await requestJson<{
            items: Array<{
              name: string;
              displayPath: string;
              fullPath: string;
              openPath: string;
              locationKind: 'direct' | 'dynamic-preset';
              globalEnabled: boolean;
              directProjects: Array<{ projectId: string; projectPath: string }>;
              viaPresetProjects: Array<{ projectId: string; projectPath: string; viaPresetNames?: string[] }>;
            }>;
          }>(`${baseUrl}/api/skills`);
          expect(skillsResponse.status).toBe(200);
          expect(skillsResponse.body.ok).toBe(true);
          expect(skillsResponse.body.data.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'brainstorming',
                displayPath: 'skills-registry/brainstorming',
                fullPath: path.join(skillsDir, 'brainstorming'),
                openPath: skillsDir,
                locationKind: 'direct',
                globalEnabled: false,
                directProjects: expect.arrayContaining([
                  expect.objectContaining({
                    projectId: expect.any(String),
                    projectPath: await fs.realpath(projectDir),
                  }),
                ]),
              }),
              expect.objectContaining({
                name: 'impeccable/overdrive',
                displayPath: 'impeccable/overdrive',
                fullPath: path.join(skillsDir, 'impeccable', 'overdrive'),
                openPath: skillsDir,
                locationKind: 'dynamic-preset',
              }),
            ]),
          );
        } finally {
          await server.stop();
        }
      });
    });
  });

  it('supports mutation APIs and returns refreshed snapshots', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['preset', 'create', 'frontend-v1', 'brainstorming', 'test-engineer'], { env: { HOME: homeDir } });
        await runCli(['skill', 'on', 'brainstorming', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });
        await runCli(['preset', 'on', 'frontend-v1', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

        process.env.HOME = homeDir;
        const server = await startUiServer({ preferredPort: 0 });
        try {
          const baseUrl = server.launchStatus.url;
          const projects = await requestJson<Array<{ projectId: string }>>(`${baseUrl}/api/projects`);
          const projectId = projects.body.data[0]?.projectId;
          expect(projectId).toBeDefined();

          const disableSkillResponse = await requestJson<{
            enabledSkills: string[];
            resolvedSkills: Array<{ name: string }>;
          }>(`${baseUrl}/api/projects/${encodeURIComponent(projectId ?? '')}/skills/off`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({ skillNames: ['brainstorming'] }),
          });
          expect(disableSkillResponse.status).toBe(200);
          expect(disableSkillResponse.body.data.enabledSkills).toEqual([]);
          expect(disableSkillResponse.body.data.resolvedSkills.map((skill) => skill.name).sort()).toEqual([
            'brainstorming',
            'test-engineer',
          ]);

          const configResponse = await requestJson<{ defaultTargets: string[] }>(`${baseUrl}/api/config`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({ defaultTargets: ['.agents', '.trae'] }),
          });
          expect(configResponse.status).toBe(200);
          expect(configResponse.body.data.defaultTargets).toEqual(['.agents', '.trae']);

          const enableGlobalSkillResponse = await requestJson<{ items: Array<{ name: string; globalEnabled: boolean }> }>(
            `${baseUrl}/api/skills/global/on`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({ skillNames: ['brainstorming'] }),
            },
          );
          expect(enableGlobalSkillResponse.status).toBe(200);
          expect(enableGlobalSkillResponse.body.data.items).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: 'brainstorming', globalEnabled: true })]),
          );

          const { paths } = await loadConfig();
          const globalState = await loadGlobalState(paths);
          expect(globalState?.targets).toMatchObject({
            '.agents': expect.any(Object),
            '.trae': expect.any(Object),
          });

          const deletePresetResponse = await requestJson<{
            deleted: { name: string; referenceCount: number };
            presets: { items: Array<{ name: string }> };
          }>(`${baseUrl}/api/presets/frontend-v1`, {
            method: 'DELETE',
          });
          expect(deletePresetResponse.status).toBe(200);
          expect(deletePresetResponse.body.data.deleted).toMatchObject({
            name: 'frontend-v1',
            referenceCount: 1,
          });
          expect(deletePresetResponse.body.data.presets.items.find((item) => item.name === 'frontend-v1')).toBeUndefined();
        } finally {
          await server.stop();
        }
      });
    });
  });

  it('opens derived skill locations through the dedicated skill quick-open endpoint', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      const skillsDir = path.join(homeDir, 'skills-registry');
      await createSkillFixtures(skillsDir, [
        { dirName: 'brainstorming', name: 'brainstorming' },
        { dirName: 'impeccable/overdrive', name: 'overdrive' },
      ]);
      await initConfigWithSkills(homeDir, skillsDir);

      const openedPaths: string[] = [];
      const facade = new UiFacade({
        openProjectPath: async (targetPath) => {
          openedPaths.push(targetPath);
          return {
            success: true,
            strategy: 'code',
            message: `Opened ${targetPath}.`,
          };
        },
      });

      process.env.HOME = homeDir;
      const server = await startUiServer({ preferredPort: 0, facade });
      try {
        const baseUrl = server.launchStatus.url;

        const directResponse = await requestJson<{ success: boolean; strategy: string | null; message: string }>(
          `${baseUrl}/api/skills/${encodeURIComponent('brainstorming')}/quick-open`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({}),
          },
        );
        expect(directResponse.status).toBe(200);
        expect(directResponse.body.ok).toBe(true);

        const scopedResponse = await requestJson<{ success: boolean; strategy: string | null; message: string }>(
          `${baseUrl}/api/skills/${encodeURIComponent('impeccable/overdrive')}/quick-open`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({}),
          },
        );
        expect(scopedResponse.status).toBe(200);
        expect(scopedResponse.body.ok).toBe(true);
        expect(openedPaths).toEqual([skillsDir, skillsDir]);
      } finally {
        await server.stop();
      }
    });
  });

  it('provides a structured preset delete preview contract', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['preset', 'create', 'frontend-v1', 'brainstorming', 'test-engineer'], { env: { HOME: homeDir } });
        await runCli(['preset', 'on', 'frontend-v1', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

        process.env.HOME = homeDir;
        const server = await startUiServer({ preferredPort: 0 });
        try {
          const baseUrl = server.launchStatus.url;
          const previewResponse = await requestJson<{
            name: string;
            referenceCount: number;
            source: string;
            readonly: boolean;
            referenceProjects: Array<{ projectId: string; projectPath: string }>;
          }>(`${baseUrl}/api/presets/frontend-v1/rm-preview`);

          expect(previewResponse.status).toBe(200);
          expect(previewResponse.body.ok).toBe(true);
          expect(previewResponse.body.data.name).toBe('frontend-v1');
          expect(previewResponse.body.data.referenceCount).toBe(1);
          expect(previewResponse.body.data.source).toBe('static');
          expect(previewResponse.body.data.readonly).toBe(false);
          expect(previewResponse.body.data.referenceProjects).toHaveLength(1);
          expect(previewResponse.body.data.referenceProjects[0]).toMatchObject({
            projectId: expect.any(String),
            projectPath: await fs.realpath(projectDir),
          });
        } finally {
          await server.stop();
        }
      });
    });
  });

  it('returns structured errors for invalid config payloads and malformed json bodies', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['skill', 'on', 'brainstorming', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

        process.env.HOME = homeDir;
        const server = await startUiServer({ preferredPort: 0 });
        try {
          const baseUrl = server.launchStatus.url;

          const invalidConfig = await requestJson<{ defaultTargets: string[] }>(`${baseUrl}/api/config`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({ defaultTargets: 'bad-type' }),
          });
          expect(invalidConfig.status).toBe(400);
          expect(invalidConfig.body.ok).toBe(false);
          expect(invalidConfig.body.error).toMatchObject({
            kind: 'usage',
          });
          expect(invalidConfig.body.error?.fieldErrors).toMatchObject({
            defaultTargets: expect.any(String),
          });

          const malformed = await fetch(`${baseUrl}/api/config`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: '{ "skillsDir": ',
          });
          expect(malformed.status).toBe(400);
          const malformedBody = (await malformed.json()) as ApiEnvelope<unknown>;
          expect(malformedBody.ok).toBe(false);
          expect(malformedBody.error).toMatchObject({
            kind: 'usage',
            message: '请求体必须是合法 JSON。',
          });

          const malformedEnglish = await fetch(`${baseUrl}/api/config`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-skm-lang': 'en-US',
            },
            body: '{ "skillsDir": ',
          });
          expect(malformedEnglish.status).toBe(400);
          const malformedEnglishBody = (await malformedEnglish.json()) as ApiEnvelope<unknown>;
          expect(malformedEnglishBody.ok).toBe(false);
          expect(malformedEnglishBody.error).toMatchObject({
            kind: 'usage',
            message: 'Request body must be valid JSON.',
          });
        } finally {
          await server.stop();
        }
      });
    });
  });

  it('exposes dynamic preset metadata and blocks delete for readonly presets', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'impeccable/overdrive', name: 'overdrive' },
          { dirName: 'impeccable/polish', name: 'polish' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['preset', 'on', 'impeccable', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

        process.env.HOME = homeDir;
        const server = await startUiServer({ preferredPort: 0 });
        try {
          const baseUrl = server.launchStatus.url;
          const projects = await requestJson<Array<{ projectId: string }>>(`${baseUrl}/api/projects`);
          const projectId = projects.body.data[0]?.projectId;

          const presetsResponse = await requestJson<{
            items: Array<{ name: string; source: string; readonly: boolean; skills: string[] }>;
          }>(`${baseUrl}/api/presets`);
          expect(presetsResponse.status).toBe(200);
          expect(presetsResponse.body.data.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'impeccable',
                source: 'dynamic',
                readonly: true,
                skills: ['impeccable/overdrive', 'impeccable/polish'],
              }),
            ]),
          );

          const detailResponse = await requestJson<{
            enabledPresets: Array<{ name: string; source: string; readonly: boolean; skills: string[] }>;
          }>(`${baseUrl}/api/projects/${encodeURIComponent(projectId ?? '')}`);
          expect(detailResponse.status).toBe(200);
          expect(detailResponse.body.data.enabledPresets).toEqual([
            expect.objectContaining({
              name: 'impeccable',
              source: 'dynamic',
              readonly: true,
              skills: ['impeccable/overdrive', 'impeccable/polish'],
            }),
          ]);

          const previewResponse = await requestJson<{ name: string; source: string; readonly: boolean }>(
            `${baseUrl}/api/presets/impeccable/rm-preview`,
          );
          expect(previewResponse.status).toBe(200);
          expect(previewResponse.body.data).toMatchObject({
            name: 'impeccable',
            source: 'dynamic',
            readonly: true,
          });

          const deleteResponse = await requestJson<unknown>(`${baseUrl}/api/presets/impeccable`, {
            method: 'DELETE',
          });
          expect(deleteResponse.status).toBe(409);
          expect(deleteResponse.body.ok).toBe(false);
          expect(deleteResponse.body.error).toMatchObject({
            kind: 'conflict',
            message: '技能集 impeccable 是动态作用域技能集，无法修改。',
          });

          const deleteEnglishResponse = await requestJson<unknown>(`${baseUrl}/api/presets/impeccable`, {
            method: 'DELETE',
            headers: {
              'x-skm-lang': 'en-US',
            },
          });
          expect(deleteEnglishResponse.status).toBe(409);
          expect(deleteEnglishResponse.body.ok).toBe(false);
          expect(deleteEnglishResponse.body.error).toMatchObject({
            kind: 'conflict',
            message: 'Preset impeccable is a dynamic scope preset and cannot be modified.',
          });
        } finally {
          await server.stop();
        }
      });
    });
  });
});
