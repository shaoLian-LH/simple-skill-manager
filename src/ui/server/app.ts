import type { IncomingMessage, ServerResponse } from 'node:http';

import { SkmError } from '../../core/errors.js';
import type { ApiErrorEnvelope, ApiSuccessEnvelope, BootView, LaunchStatusView } from '../contracts/api.js';
import { UiFacade } from '../facade/service.js';
import { DEFAULT_UI_LOCALE, translateUiText, type UiLocale } from '../text.js';
import { readWebAsset } from './assets.js';
import { toApiErrorDetail, toHttpStatusCode } from './errors.js';
import { normalizePathname, readJsonBody, sendJson, sendText } from './http.js';
import { resolveRequestUiLocale } from './locale.js';

function ok<T>(data: T): ApiSuccessEnvelope<T> {
  return {
    ok: true,
    data,
  };
}

function fail(error: unknown, locale: UiLocale = DEFAULT_UI_LOCALE): ApiErrorEnvelope {
  return {
    ok: false,
    error: toApiErrorDetail(error, locale),
  };
}

function notFoundApiRoute(pathname: string, locale: UiLocale): SkmError {
  return new SkmError('usage', translateUiText(locale, 'server.unknownApiRoute', { pathname }), {
    hint: translateUiText(locale, 'server.unknownApiRouteHint'),
  });
}

function resolveReturnLocation(request: IncomingMessage): string {
  const referer = request.headers.referer;
  if (!referer) {
    return '/';
  }

  try {
    const parsed = new URL(referer);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return '/';
  }
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
    const locale = resolveRequestUiLocale(request);

    try {
      if (!pathname.startsWith('/api/')) {
        if (method !== 'GET') {
          throw new SkmError('usage', translateUiText(locale, 'server.unsupportedUiMethod', { method }), {
            hint: translateUiText(locale, 'server.unsupportedUiMethodHint'),
          });
        }

        const assetPath = pathname === '/' ? 'index.html' : pathname.slice(1);
        const fallbackToIndex = !assetPath.startsWith('assets/');
        try {
          const asset = await readWebAsset(assetPath, locale);
          sendText(response, 200, asset.contentType, asset.content);
        } catch (error) {
          if (!fallbackToIndex) {
            throw error;
          }

          const indexAsset = await readWebAsset('index.html', locale);
          sendText(response, 200, indexAsset.contentType, indexAsset.content);
        }
        return;
      }

      if (method === 'GET' && pathname === '/api/dashboard') {
        sendJson(response, 200, ok(await options.facade.getDashboard(locale)));
        return;
      }

      if (method === 'GET' && pathname === '/api/overview') {
        const boot = await options.getBoot();
        sendJson(response, 200, ok(await options.facade.getOverview(boot.launchCwd, locale)));
        return;
      }

      if (method === 'GET' && pathname === '/api/config') {
        sendJson(response, 200, ok(await options.facade.getConfig(locale)));
        return;
      }

      if (method === 'POST' && pathname === '/api/config') {
        sendJson(response, 200, ok(await options.facade.updateConfig(await readJsonBody(request, locale), locale)));
        return;
      }

      if (method === 'POST' && pathname === '/api/config/skills-dir/pick') {
        sendJson(response, 200, ok(await options.facade.pickSkillsDirectory(locale)));
        return;
      }

      if (method === 'GET' && pathname === '/api/projects') {
        sendJson(response, 200, ok(await options.facade.getProjects()));
        return;
      }

      if (method === 'GET' && pathname === '/api/presets') {
        sendJson(response, 200, ok(await options.facade.getPresets(locale)));
        return;
      }

      if (method === 'GET' && pathname === '/api/skills') {
        sendJson(response, 200, ok(await options.facade.getSkills()));
        return;
      }

      if (method === 'POST' && pathname === '/api/skills/global/enable') {
        sendJson(response, 200, ok(await options.facade.enableGlobalSkills(await readJsonBody(request, locale), locale)));
        return;
      }

      if (method === 'POST' && pathname === '/api/skills/global/disable') {
        sendJson(response, 200, ok(await options.facade.disableGlobalSkills(await readJsonBody(request, locale), locale)));
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

      if (method === 'GET' && pathname === '/api/launch-cwd/open') {
        const boot = await options.getBoot();
        await options.facade.quickOpenPath(boot.launchCwd, locale);
        response.writeHead(303, {
          location: resolveReturnLocation(request),
          'cache-control': 'no-store',
        });
        response.end();
        return;
      }

      if (method === 'POST' && pathname === '/api/launch-cwd/open') {
        const boot = await options.getBoot();
        sendJson(response, 200, ok(await options.facade.quickOpenPath(boot.launchCwd, locale)));
        return;
      }

      const projectDetailMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'GET' && projectDetailMatch) {
        const projectId = decodeURIComponent(projectDetailMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.getProjectDetail(projectId, locale)));
        return;
      }

      const projectSkillEnableMatch = pathname.match(/^\/api\/projects\/([^/]+)\/skills\/enable$/);
      if (method === 'POST' && projectSkillEnableMatch) {
        const projectId = decodeURIComponent(projectSkillEnableMatch[1] ?? '');
        sendJson(
          response,
          200,
          ok(await options.facade.enableProjectSkills(projectId, await readJsonBody(request, locale), locale)),
        );
        return;
      }

      const projectSkillDisableMatch = pathname.match(/^\/api\/projects\/([^/]+)\/skills\/disable$/);
      if (method === 'POST' && projectSkillDisableMatch) {
        const projectId = decodeURIComponent(projectSkillDisableMatch[1] ?? '');
        sendJson(
          response,
          200,
          ok(await options.facade.disableProjectSkills(projectId, await readJsonBody(request, locale), locale)),
        );
        return;
      }

      const projectPresetEnableMatch = pathname.match(/^\/api\/projects\/([^/]+)\/presets\/enable$/);
      if (method === 'POST' && projectPresetEnableMatch) {
        const projectId = decodeURIComponent(projectPresetEnableMatch[1] ?? '');
        sendJson(
          response,
          200,
          ok(await options.facade.enableProjectPresets(projectId, await readJsonBody(request, locale), locale)),
        );
        return;
      }

      const projectPresetDisableMatch = pathname.match(/^\/api\/projects\/([^/]+)\/presets\/disable$/);
      if (method === 'POST' && projectPresetDisableMatch) {
        const projectId = decodeURIComponent(projectPresetDisableMatch[1] ?? '');
        sendJson(
          response,
          200,
          ok(await options.facade.disableProjectPresets(projectId, await readJsonBody(request, locale), locale)),
        );
        return;
      }

      const projectQuickOpenMatch = pathname.match(/^\/api\/projects\/([^/]+)\/quick-open$/);
      if (method === 'POST' && projectQuickOpenMatch) {
        const projectId = decodeURIComponent(projectQuickOpenMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.quickOpenProject(projectId, locale)));
        return;
      }

      const projectParentQuickOpenMatch = pathname.match(/^\/api\/projects\/([^/]+)\/parent-quick-open$/);
      if (method === 'POST' && projectParentQuickOpenMatch) {
        const projectId = decodeURIComponent(projectParentQuickOpenMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.quickOpenProjectParent(projectId, locale)));
        return;
      }

      const skillQuickOpenMatch = pathname.match(/^\/api\/skills\/([^/]+)\/quick-open$/);
      if (method === 'POST' && skillQuickOpenMatch) {
        const skillName = decodeURIComponent(skillQuickOpenMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.quickOpenSkill(skillName, locale)));
        return;
      }

      if (method === 'POST' && pathname === '/api/presets') {
        sendJson(response, 200, ok(await options.facade.createPreset(await readJsonBody(request, locale), locale)));
        return;
      }

      const deletePreviewPresetMatch = pathname.match(/^\/api\/presets\/([^/]+)\/delete-preview$/);
      if (method === 'GET' && deletePreviewPresetMatch) {
        const presetName = decodeURIComponent(deletePreviewPresetMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.getPresetDeletePreview(presetName, locale)));
        return;
      }

      const presetDetailMatch = pathname.match(/^\/api\/presets\/([^/]+)$/);
      if (method === 'GET' && presetDetailMatch) {
        const presetName = decodeURIComponent(presetDetailMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.getPresetDetail(presetName, locale)));
        return;
      }

      const updatePresetMatch = pathname.match(/^\/api\/presets\/([^/]+)$/);
      if (method === 'PUT' && updatePresetMatch) {
        const presetName = decodeURIComponent(updatePresetMatch[1] ?? '');
        sendJson(
          response,
          200,
          ok(await options.facade.updatePreset(presetName, await readJsonBody(request, locale), locale)),
        );
        return;
      }

      const deletePresetMatch = pathname.match(/^\/api\/presets\/([^/]+)$/);
      if (method === 'DELETE' && deletePresetMatch) {
        const presetName = decodeURIComponent(deletePresetMatch[1] ?? '');
        sendJson(response, 200, ok(await options.facade.deletePreset(presetName, locale)));
        return;
      }

      throw notFoundApiRoute(pathname, locale);
    } catch (error) {
      sendJson(response, toHttpStatusCode(error), fail(error, locale));
    }
  };
}
