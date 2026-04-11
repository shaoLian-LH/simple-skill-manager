import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runCli } from '../helpers/cli.js';
import { createSkillFixtures } from '../helpers/fixtures.js';
import { initConfigWithSkills } from '../helpers/skm-env.js';
import { withTempDir } from '../helpers/temp.js';
import { withMockUiBuild } from '../helpers/ui-build.js';
import { UiFacade } from '../../src/ui/facade/service.js';
import { startUiServer } from '../../src/ui/server/server.js';

describe.sequential('ui shell serving and quick-open endpoint', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('serves static assets and falls back to index for SPA routes', async () => {
    await withMockUiBuild(async () => {
      const server = await startUiServer({ preferredPort: 0 });

      try {
        const indexResponse = await fetch(`${server.launchStatus.url}/`);
        expect(indexResponse.status).toBe(200);
        expect(indexResponse.headers.get('content-type')).toContain('text/html');
        expect(await indexResponse.text()).toContain('<div id="app"></div>');

        const cssResponse = await fetch(`${server.launchStatus.url}/assets/styles.css`);
        expect(cssResponse.status).toBe(200);
        expect(cssResponse.headers.get('content-type')).toContain('text/css');

        const spaFallbackResponse = await fetch(`${server.launchStatus.url}/projects/demo-id`);
        expect(spaFallbackResponse.status).toBe(200);
        const spaFallbackBody = await spaFallbackResponse.text();
        expect(spaFallbackBody).toContain('/assets/app.js');

        const overviewFallbackResponse = await fetch(`${server.launchStatus.url}/overview`);
        expect(overviewFallbackResponse.status).toBe(200);
        expect(await overviewFallbackResponse.text()).toContain('/assets/app.js');
      } finally {
        await server.stop();
      }
    });
  });

  it('returns the host folder picker contract from the dedicated endpoint', async () => {
    const facade = new UiFacade({
      isFolderPickerAvailable: () => true,
      pickFolderPath: async () => ({
        path: '/tmp/skills-registry',
        canceled: false,
      }),
    });

    const server = await startUiServer({
      preferredPort: 0,
      facade,
    });

    try {
      const response = await fetch(`${server.launchStatus.url}/api/config/skills-dir/pick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data: { path: string | null; canceled: boolean };
      };

      expect(response.status).toBe(200);
      expect(payload).toEqual({
        ok: true,
        data: {
          path: '/tmp/skills-registry',
          canceled: false,
        },
      });
    } finally {
      await server.stop();
    }
  });

  it('keeps picker cancellation non-fatal and localizes unsupported-host errors', async () => {
    const canceledServer = await startUiServer({
      preferredPort: 0,
      facade: new UiFacade({
        isFolderPickerAvailable: () => true,
        pickFolderPath: async () => ({
          path: null,
          canceled: true,
        }),
      }),
    });

    try {
      const response = await fetch(`${canceledServer.launchStatus.url}/api/config/skills-dir/pick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data: { path: string | null; canceled: boolean };
      };

      expect(response.status).toBe(200);
      expect(payload).toEqual({
        ok: true,
        data: {
          path: null,
          canceled: true,
        },
      });
    } finally {
      await canceledServer.stop();
    }

    const unsupportedServer = await startUiServer({
      preferredPort: 0,
      facade: new UiFacade({
        isFolderPickerAvailable: () => false,
      }),
    });

    try {
      const response = await fetch(`${unsupportedServer.launchStatus.url}/api/config/skills-dir/pick`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-skm-lang': 'en-US',
        },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error: { kind: string; message: string };
      };

      expect(response.status).toBe(400);
      expect(payload.ok).toBe(false);
      expect(payload.error).toMatchObject({
        kind: 'usage',
        message: 'Folder picker is not available. Enter the path manually.',
      });
    } finally {
      await unsupportedServer.stop();
    }
  });

  it('returns quick-open action results from the dedicated endpoint', async () => {
    await withTempDir('skm-home-', async (homeDir) => {
      await withTempDir('skm-project-', async (projectDir) => {
        const resolvedProjectDir = await fs.realpath(projectDir);
        const skillsDir = path.join(homeDir, 'skills-registry');
        await createSkillFixtures(skillsDir, [{ dirName: 'brainstorming', name: 'brainstorming' }]);
        await initConfigWithSkills(homeDir, skillsDir);
        await runCli(['skill', 'on', 'brainstorming', '--target', '.agents'], {
          cwd: projectDir,
          env: { HOME: homeDir },
        });

        let shouldFail = false;
        const openedPaths: string[] = [];
        const facade = new UiFacade({
          openProjectPath: async (targetPath) => {
            openedPaths.push(targetPath);
            if (shouldFail) {
              return {
                success: false,
                strategy: null,
                message: 'Unable to open project in this environment.',
              };
            }

            return {
              success: true,
              strategy: 'code',
              message: 'Opened in VS Code.',
            };
          },
        });

        process.env.HOME = homeDir;
        const server = await startUiServer({
          preferredPort: 0,
          facade,
        });

        try {
          const projectsResponse = await fetch(`${server.launchStatus.url}/api/projects`);
          const projectsPayload = (await projectsResponse.json()) as { ok: boolean; data: Array<{ projectId: string }> };
          expect(projectsPayload.ok).toBe(true);
          const projectId = projectsPayload.data[0]?.projectId;
          expect(projectId).toBeDefined();

          const bootResponse = await fetch(`${server.launchStatus.url}/api/boot`);
          const bootPayload = (await bootResponse.json()) as { ok: boolean; data: { initialRoute: string; matchedProjectId: string | null } };
          expect(bootResponse.status).toBe(200);
          expect(bootPayload.ok).toBe(true);
          expect(bootPayload.data.initialRoute).toBe('/overview');
          expect(bootPayload.data.matchedProjectId).toBeNull();

          const launchCwdOpenResponse = await fetch(`${server.launchStatus.url}/api/launch-cwd/open`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          const launchCwdOpenPayload = (await launchCwdOpenResponse.json()) as {
            ok: boolean;
            data: { success: boolean; strategy: string | null; message: string };
          };
          expect(launchCwdOpenResponse.status).toBe(200);
          expect(launchCwdOpenPayload.ok).toBe(true);
          expect(launchCwdOpenPayload.data).toEqual({
            success: true,
            strategy: 'code',
            message: 'Opened in VS Code.',
          });

          const launchCwdLinkResponse = await fetch(`${server.launchStatus.url}/api/launch-cwd/open`, {
            redirect: 'manual',
            headers: {
              referer: `${server.launchStatus.url}/projects/demo-id?view=details#section`,
            },
          });
          expect(launchCwdLinkResponse.status).toBe(303);
          expect(launchCwdLinkResponse.headers.get('location')).toBe('/projects/demo-id?view=details#section');

          const successResponse = await fetch(
            `${server.launchStatus.url}/api/projects/${encodeURIComponent(projectId ?? '')}/quick-open`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({}),
            },
          );
          const successPayload = (await successResponse.json()) as { ok: boolean; data: { success: boolean; strategy: string | null; message: string } };
          expect(successResponse.status).toBe(200);
          expect(successPayload.ok).toBe(true);
          expect(successPayload.data).toEqual({
            success: true,
            strategy: 'code',
            message: 'Opened in VS Code.',
          });
          expect(openedPaths.at(-1)).toBe(resolvedProjectDir);

          const parentSuccessResponse = await fetch(
            `${server.launchStatus.url}/api/projects/${encodeURIComponent(projectId ?? '')}/parent-quick-open`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({}),
            },
          );
          const parentSuccessPayload = (await parentSuccessResponse.json()) as {
            ok: boolean;
            data: { success: boolean; strategy: string | null; message: string };
          };
          expect(parentSuccessResponse.status).toBe(200);
          expect(parentSuccessPayload.ok).toBe(true);
          expect(parentSuccessPayload.data).toEqual({
            success: true,
            strategy: 'code',
            message: 'Opened in VS Code.',
          });
          expect(openedPaths.at(-1)).toBe(path.dirname(resolvedProjectDir));

          shouldFail = true;
          const failureResponse = await fetch(
            `${server.launchStatus.url}/api/projects/${encodeURIComponent(projectId ?? '')}/quick-open`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({}),
            },
          );
          const failurePayload = (await failureResponse.json()) as { ok: boolean; data: { success: boolean; strategy: string | null; message: string } };
          expect(failureResponse.status).toBe(200);
          expect(failurePayload.ok).toBe(true);
          expect(failurePayload.data).toEqual({
            success: false,
            strategy: null,
            message: 'Unable to open project in this environment.',
          });
        } finally {
          await server.stop();
        }
      });
    });
  });
});
