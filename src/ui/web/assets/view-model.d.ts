import type { UiLocale } from '../../text.js';

export type AppRoute =
  | { name: 'dashboard' }
  | { name: 'projects' }
  | { name: 'project-detail'; projectId: string }
  | { name: 'presets' }
  | { name: 'config' }
  | { name: 'not-found' };

export interface ProjectFilterItem {
  projectId: string;
  projectPath: string;
}

export interface QuickAction {
  id: string;
  label: string;
  command: string;
}

export interface PresetDeletePreview {
  name: string;
  referenceCount: number;
  source?: 'static' | 'dynamic';
  readonly?: boolean;
  referenceProjects: Array<{
    projectId: string;
    projectPath: string;
  }>;
}

export function parseRoute(pathname: string): AppRoute;
export function routeToPath(route: AppRoute): string;
export function filterProjects(projects: ProjectFilterItem[], searchQuery: string): ProjectFilterItem[];
export function getProjectLabel(projectPath: string, locale?: UiLocale): string;
export function formatRelativeTime(value?: string, now?: number, locale?: UiLocale): string;
export function formatRouteTitle(route: AppRoute, locale?: UiLocale): string;
export function pickQuickActions(input: {
  route: AppRoute;
  dashboard?: { quickActions?: QuickAction[] } | null;
  projectsQuickActions?: QuickAction[] | null;
  projectDetail?: { quickActions?: QuickAction[] } | null;
  presets?: { quickActions?: QuickAction[] } | null;
  config?: { quickActions?: QuickAction[] } | null;
}): QuickAction[];
export function buildPresetDeleteConfirmationMessage(
  preview: PresetDeletePreview | null | undefined,
  locale?: UiLocale,
): string;
