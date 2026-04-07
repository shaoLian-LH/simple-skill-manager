import type { IncomingMessage, ServerResponse } from 'node:http';

import { SkmError } from '../../core/errors.js';
import type { ApiErrorEnvelope, ApiSuccessEnvelope, BootView, LaunchStatusView } from '../contracts/api.js';
import { UiFacade } from '../facade/service.js';
import { readWebAsset } from './assets.js';
import { toApiErrorDetail, toHttpStatusCode } from './errors.js';
import { normalizePathname, readJsonBody, sendJson, sendText } from './http.js';

function ok<T>(data: T): ApiSuccessEnvelope<T> {
  return {
    ok: true,
    data,
  };
}

function fail(error: unknown): ApiErrorEnvelope {
  return {
    ok: false,
    error: toApiErrorDetail(error),
  };
}

function notFoundApiRoute(pathname: string): SkmError {
  return new SkmError('usage', `Unknown API route: ${pathname}.`, {
    hint: 'Use documented routes under `/api/*`.',
  });
}

export interface UiRequestHandlerOptions {
  facade: UiFacade;
  getLaunchStatus: () => LaunchStatusView;
  getBoot: () => Promise<BootView>;
}

export function createUiRequestHandler(options: UiRequestHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const method = (request.method ?? 'GET').toUpperCase();
    const pathname = normalizePathname(request.url);

    try {
      if (!pathname.startsWith('/api/')) {
        if (method !== 'GET') {
          throw new SkmError('usage', `Unsupported method for UI route: ${method}.`, {
            hint: 'Use GET when loading Web UI pages or assets.',
          });
        }

        const assetPath = pathname === '/' ? 'index.html' : pathname.slice(1);
        const fallbackToIndex = !assetPath.startsWith('assets/');
        try {
          const asset = await readWebAsset(assetPath);
          sendText(response, 200, asset.contentType, asset.content);
        } catch (error) {
          if (!fallbackToIndex) {
            throw error;
          }

          const indexAsset = await readWebAsset('index.html');
          sendText(response, 200, indexAsset.contentType, indexAsset.content);
        }
        return;
      }

      if (method === 'GET' && pathname === '/api/dashboard') {
        sendJson(response, 200, ok(await options.facade.getDashboard()));
        return;
      }

      if (method === 'GET' && pathname === '/api/config') {
        sendJson(response, 200, ok(await options.facade.getConfig()));
        return;
      }

      if (method === 'POST' && pathname === '/api/config') {
        sendJson(response, 200, ok(await options.facade.updateConfig(await readJsonBody(request))));
        return;
      }

      if (method === 'GET' && pathname === '/api/projects') {
        sendJson(response, 200, ok(await options.facade.getProjects()));
        return;
      }

      if (method === 'GET' && pathname === '/api/presets') {
        sendJson(response, 200, ok(await options.facade.getPresets()));
        return;
      }

      if (method === 'GET' && pathname === '/api/skills') {
        sendJson(response, 200, ok(await options.facade.getSkills()));
        return;
      }

      if (method === 'GET' && pathname === '/api/launch-status') {
        sendJson(response, 200, ok(options.getLaunchStatus()));
        return;
      }

      if (method === 'GET' && pathname === '/api/boot') {
        sendJson(response, 200, ok(await options.getBoot()));
        return;
      }

      const projectDetailMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'GET' && projectDetailMatch) {
        const projectId = decodeURIComponent(projectDetailMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.getProjectDetail(projectId)));
        return;
      }

      const projectSkillEnableMatch = pathname.match(/^\/api\/projects\/([^/]+)\/skills\/enable$/);
      if (method === 'POST' && projectSkillEnableMatch) {
        const projectId = decodeURIComponent(projectSkillEnableMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.enableProjectSkills(projectId, await readJsonBody(request))));
        return;
      }

      const projectSkillDisableMatch = pathname.match(/^\/api\/projects\/([^/]+)\/skills\/disable$/);
      if (method === 'POST' && projectSkillDisableMatch) {
        const projectId = decodeURIComponent(projectSkillDisableMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.disableProjectSkills(projectId, await readJsonBody(request))));
        return;
      }

      const projectPresetEnableMatch = pathname.match(/^\/api\/projects\/([^/]+)\/presets\/enable$/);
      if (method === 'POST' && projectPresetEnableMatch) {
        const projectId = decodeURIComponent(projectPresetEnableMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.enableProjectPresets(projectId, await readJsonBody(request))));
        return;
      }

      const projectPresetDisableMatch = pathname.match(/^\/api\/projects\/([^/]+)\/presets\/disable$/);
      if (method === 'POST' && projectPresetDisableMatch) {
        const projectId = decodeURIComponent(projectPresetDisableMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.disableProjectPresets(projectId, await readJsonBody(request))));
        return;
      }

      const projectQuickOpenMatch = pathname.match(/^\/api\/projects\/([^/]+)\/quick-open$/);
      if (method === 'POST' && projectQuickOpenMatch) {
        const projectId = decodeURIComponent(projectQuickOpenMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.quickOpenProject(projectId)));
        return;
      }

      if (method === 'POST' && pathname === '/api/presets') {
        sendJson(response, 200, ok(await options.facade.createPreset(await readJsonBody(request))));
        return;
      }

      const deletePreviewPresetMatch = pathname.match(/^\/api\/presets\/([^/]+)\/delete-preview$/);
      if (method === 'GET' && deletePreviewPresetMatch) {
        const presetName = decodeURIComponent(deletePreviewPresetMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.getPresetDeletePreview(presetName)));
        return;
      }

      const updatePresetMatch = pathname.match(/^\/api\/presets\/([^/]+)$/);
      if (method === 'PUT' && updatePresetMatch) {
        const presetName = decodeURIComponent(updatePresetMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.updatePreset(presetName, await readJsonBody(request))));
        return;
      }

      const deletePresetMatch = pathname.match(/^\/api\/presets\/([^/]+)$/);
      if (method === 'DELETE' && deletePresetMatch) {
        const presetName = decodeURIComponent(deletePresetMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.deletePreset(presetName)));
        return;
      }

      throw notFoundApiRoute(pathname);
    } catch (error) {
      sendJson(response, toHttpStatusCode(error), fail(error));
    }
  };
}
