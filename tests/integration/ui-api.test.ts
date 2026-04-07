import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createSkillFixtures } from '../helpers/fixtures.js';
import { runCli } from '../helpers/cli.js';
import { initConfigWithSkills } from '../helpers/skm-env.js';
import { withTempDir } from '../helpers/temp.js';
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
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['preset', 'add', 'frontend-v1', 'brainstorming', 'test-engineer'], { env: { HOME: homeDir } });
        await runCli(['skill', 'enable', 'brainstorming', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });
        await runCli(['preset', 'enable', 'frontend-v1', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

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
            enabledPresets: Array<{ name: string }>;
            enabledSkills: string[];
            resolvedSkills: Array<{ name: string; direct: boolean; viaPresets: string[]; sourceLabels: string[] }>;
          }>(`${baseUrl}/api/projects/${encodeURIComponent(project!.projectId)}`);
          expect(detailResponse.status).toBe(200);
          expect(detailResponse.body.ok).toBe(true);
          expect(detailResponse.body.data.projectPath).toBe(await fs.realpath(projectDir));
          expect(detailResponse.body.data.enabledPresets.map((preset) => preset.name)).toEqual(['frontend-v1']);
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

          const presetsResponse = await requestJson<{ items: Array<{ name: string }>; quickActions: Array<{ id: string; command: string }> }>(
            `${baseUrl}/api/presets`,
          );
          expect(presetsResponse.status).toBe(200);
          expect(presetsResponse.body.ok).toBe(true);
          expect(presetsResponse.body.data.quickActions.length).toBeGreaterThan(0);
          expect(presetsResponse.body.data.quickActions[0]).toMatchObject({
            id: expect.any(String),
            command: expect.any(String),
          });

          const configResponse = await requestJson<{
            skillsDir: string;
            quickActions: Array<{ id: string; command: string }>;
          }>(`${baseUrl}/api/config`);
          expect(configResponse.status).toBe(200);
          expect(configResponse.body.ok).toBe(true);
          expect(configResponse.body.data.quickActions.length).toBeGreaterThan(0);
          expect(configResponse.body.data.quickActions[0]).toMatchObject({
            id: expect.any(String),
            command: expect.any(String),
          });
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
        await runCli(['preset', 'add', 'frontend-v1', 'brainstorming', 'test-engineer'], { env: { HOME: homeDir } });
        await runCli(['skill', 'enable', 'brainstorming', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });
        await runCli(['preset', 'enable', 'frontend-v1', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

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
          }>(`${baseUrl}/api/projects/${encodeURIComponent(projectId ?? '')}/skills/disable`, {
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

  it('provides a structured preset delete preview contract', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [
          { dirName: 'brainstorming', name: 'brainstorming' },
          { dirName: 'test-engineer', name: 'test-engineer' },
        ]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['preset', 'add', 'frontend-v1', 'brainstorming', 'test-engineer'], { env: { HOME: homeDir } });
        await runCli(['preset', 'enable', 'frontend-v1', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

        process.env.HOME = homeDir;
        const server = await startUiServer({ preferredPort: 0 });
        try {
          const baseUrl = server.launchStatus.url;
          const previewResponse = await requestJson<{
            name: string;
            referenceCount: number;
            referenceProjects: Array<{ projectId: string; projectPath: string }>;
          }>(`${baseUrl}/api/presets/frontend-v1/delete-preview`);

          expect(previewResponse.status).toBe(200);
          expect(previewResponse.body.ok).toBe(true);
          expect(previewResponse.body.data.name).toBe('frontend-v1');
          expect(previewResponse.body.data.referenceCount).toBe(1);
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
        await runCli(['skill', 'enable', 'brainstorming', '--target', '.agents'], { cwd: projectDir, env: { HOME: homeDir } });

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
            message: 'Request body must be valid JSON.',
          });
        } finally {
          await server.stop();
        }
      });
    });
  });
});
