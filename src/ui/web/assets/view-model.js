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

export function getProjectLabel(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.length === 0) {
    return 'Untitled project';
  }

  const normalized = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? projectPath;
}

export function formatRelativeTime(value, now = Date.now()) {
  if (!value) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  const diffMs = now - parsed.getTime();
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) {
    return future ? 'in under a minute' : 'just now';
  }

  if (absMs < hour) {
    const minutes = Math.round(absMs / minute);
    return future ? `in ${minutes}m` : `${minutes}m ago`;
  }

  if (absMs < day) {
    const hours = Math.round(absMs / hour);
    return future ? `in ${hours}h` : `${hours}h ago`;
  }

  const days = Math.round(absMs / day);
  if (days === 1) {
    return future ? 'tomorrow' : 'yesterday';
  }

  return future ? `in ${days}d` : `${days}d ago`;
}

export function formatRouteTitle(route) {
  if (route.name === 'dashboard') {
    return 'Dashboard';
  }

  if (route.name === 'projects') {
    return 'Projects';
  }

  if (route.name === 'project-detail') {
    return 'Project Detail';
  }

  if (route.name === 'presets') {
    return 'Presets';
  }

  if (route.name === 'config') {
    return 'Global Config';
  }

  return 'Not Found';
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

export function buildPresetDeleteConfirmationMessage(preview) {
  if (!preview || typeof preview !== 'object') {
    return 'Delete this preset?';
  }

  const name = typeof preview.name === 'string' ? preview.name : 'this preset';
  if (preview.readonly === true) {
    return `Preset ${name} is dynamic and read-only. Delete the scope directory instead.`;
  }

  const referenceCount = typeof preview.referenceCount === 'number' ? preview.referenceCount : 0;
  if (referenceCount <= 0) {
    return `Delete preset ${name}?`;
  }

  const referenceLines = Array.isArray(preview.referenceProjects)
    ? preview.referenceProjects
        .slice(0, 5)
        .map((project) => (typeof project?.projectPath === 'string' ? `- ${project.projectPath}` : '- (unknown project)'))
    : [];

  const suffix = preview.referenceCount > 5 ? '\n- ...' : '';
  return [
    `Preset ${name} is currently shaping ${referenceCount} project(s).`,
    '',
    ...referenceLines,
    suffix,
    '',
    `Delete preset ${name} anyway?`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
