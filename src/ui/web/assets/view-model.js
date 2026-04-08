import {
  DEFAULT_UI_LOCALE,
  formatUiRelativeTime,
  translateUiText,
} from '../../text.js';

export function parseRoute(pathname) {
  if (pathname === '/' || pathname === '/dashboard') {
    return { name: 'dashboard' };
  }

  if (pathname === '/projects') {
    return { name: 'projects' };
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    let projectId;
    try {
      projectId = decodeURIComponent(projectMatch[1]);
    } catch {
      return { name: 'not-found' };
    }

    return {
      name: 'project-detail',
      projectId,
    };
  }

  if (pathname === '/presets') {
    return { name: 'presets' };
  }

  if (pathname === '/config') {
    return { name: 'config' };
  }

  return { name: 'not-found' };
}

export function routeToPath(route) {
  if (route.name === 'dashboard') {
    return '/dashboard';
  }

  if (route.name === 'projects') {
    return '/projects';
  }

  if (route.name === 'project-detail') {
    return `/projects/${encodeURIComponent(route.projectId)}`;
  }

  if (route.name === 'presets') {
    return '/presets';
  }

  if (route.name === 'config') {
    return '/config';
  }

  return '/dashboard';
}

export function filterProjects(projects, searchQuery) {
  const normalized = searchQuery.trim().toLowerCase();
  if (normalized.length === 0) {
    return projects;
  }

  return projects.filter((project) => {
    return (
      project.projectPath.toLowerCase().includes(normalized) ||
      project.projectId.toLowerCase().includes(normalized)
    );
  });
}

export function getProjectLabel(projectPath, locale = DEFAULT_UI_LOCALE) {
  if (typeof projectPath !== 'string' || projectPath.length === 0) {
    return translateUiText(locale, 'common.untitledProject');
  }

  const normalized = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? projectPath;
}

export function formatRelativeTime(value, now = Date.now(), locale = DEFAULT_UI_LOCALE) {
  return formatUiRelativeTime(locale, value, now);
}

export function formatRouteTitle(route, locale = DEFAULT_UI_LOCALE) {
  if (route.name === 'dashboard') {
    return translateUiText(locale, 'route.overview');
  }

  if (route.name === 'projects') {
    return translateUiText(locale, 'route.projects');
  }

  if (route.name === 'project-detail') {
    return translateUiText(locale, 'route.projectDetail');
  }

  if (route.name === 'presets') {
    return translateUiText(locale, 'route.presets');
  }

  if (route.name === 'config') {
    return translateUiText(locale, 'route.config');
  }

  return translateUiText(locale, 'route.notFound');
}

export function pickQuickActions({ route, dashboard, projectsQuickActions, projectDetail, presets, config }) {
  if (route.name === 'dashboard') {
    return dashboard?.quickActions ?? [];
  }

  if (route.name === 'projects') {
    return projectsQuickActions ?? [];
  }

  if (route.name === 'project-detail') {
    return projectDetail?.quickActions ?? [];
  }

  if (route.name === 'presets') {
    return presets?.quickActions ?? [];
  }

  if (route.name === 'config') {
    return config?.quickActions ?? [];
  }

  return [];
}

export function buildPresetDeleteConfirmationMessage(preview, locale = DEFAULT_UI_LOCALE) {
  if (!preview || typeof preview !== 'object') {
    return translateUiText(locale, 'presetDetail.deleteConfirmEmpty', { name: 'preset' });
  }

  const name = typeof preview.name === 'string' ? preview.name : 'preset';
  if (preview.readonly === true) {
    return translateUiText(locale, 'presetDetail.readonlyDeleteBlocked', { name });
  }

  const referenceCount = typeof preview.referenceCount === 'number' ? preview.referenceCount : 0;
  if (referenceCount <= 0) {
    return translateUiText(locale, 'presetDetail.deleteConfirmEmpty', { name });
  }

  const referenceLines = Array.isArray(preview.referenceProjects)
    ? preview.referenceProjects
        .slice(0, 5)
        .map((project) => (typeof project?.projectPath === 'string' ? `- ${project.projectPath}` : `- ${translateUiText(locale, 'common.unknownProject')}`))
    : [];

  const suffix = preview.referenceCount > 5 ? '\n- ...' : '';
  return translateUiText(locale, 'presetDetail.deleteConfirmWithRefs', {
    name,
    count: referenceCount,
    projects: [...referenceLines, suffix].filter(Boolean).join('\n'),
  });
}
