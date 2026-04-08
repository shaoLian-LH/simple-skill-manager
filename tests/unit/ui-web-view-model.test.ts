import { describe, expect, it } from 'vitest';

import {
  buildPresetDeleteConfirmationMessage,
  filterProjects,
  formatRelativeTime,
  formatRouteTitle,
  getProjectLabel,
  parseRoute,
  pickQuickActions,
  routeToPath,
} from '../../src/ui/web/assets/view-model.js';

describe('ui web view model helpers', () => {
  it('parses and serializes supported routes', () => {
    expect(parseRoute('/')).toEqual({ name: 'dashboard' });
    expect(parseRoute('/projects')).toEqual({ name: 'projects' });
    expect(parseRoute('/projects/p_abc')).toEqual({ name: 'project-detail', projectId: 'p_abc' });
    expect(parseRoute('/presets')).toEqual({ name: 'presets' });
    expect(parseRoute('/config')).toEqual({ name: 'config' });
    expect(parseRoute('/unknown')).toEqual({ name: 'not-found' });
    expect(parseRoute('/projects/%E0%A4%A')).toEqual({ name: 'not-found' });

    expect(routeToPath({ name: 'dashboard' })).toBe('/dashboard');
    expect(routeToPath({ name: 'project-detail', projectId: 'p_123' })).toBe('/projects/p_123');
  });

  it('filters projects with case-insensitive search', () => {
    const projects = [
      { projectId: 'p_alpha', projectPath: '/Users/demo/alpha' },
      { projectId: 'p_beta', projectPath: '/Users/demo/beta' },
    ];

    expect(filterProjects(projects, '')).toHaveLength(2);
    expect(filterProjects(projects, 'ALPHA')).toEqual([projects[0]]);
    expect(filterProjects(projects, 'p_beta')).toEqual([projects[1]]);
  });

  it('formats route titles', () => {
    expect(formatRouteTitle({ name: 'dashboard' })).toBe('总览');
    expect(formatRouteTitle({ name: 'project-detail', projectId: 'p_x' })).toBe('项目详情');
    expect(formatRouteTitle({ name: 'not-found' })).toBe('页面不存在');
    expect(formatRouteTitle({ name: 'dashboard' }, 'en-US')).toBe('Overview');
  });

  it('derives friendly project labels from project paths', () => {
    expect(getProjectLabel('/Users/demo/alpha')).toBe('alpha');
    expect(getProjectLabel('C:\\Users\\demo\\beta\\')).toBe('beta');
    expect(getProjectLabel('')).toBe('未命名项目');
    expect(getProjectLabel('', 'en-US')).toBe('Untitled project');
  });

  it('formats relative times for recent and future timestamps', () => {
    const now = Date.UTC(2026, 3, 5, 12, 0, 0);

    expect(formatRelativeTime('2026-04-05T11:59:40.000Z', now)).toBe('刚刚');
    expect(formatRelativeTime('2026-04-05T11:50:00.000Z', now)).toBe('10 分钟前');
    expect(formatRelativeTime('2026-04-05T15:00:00.000Z', now)).toBe('3 小时后');
    expect(formatRelativeTime(undefined, now)).toBe('未知');
    expect(formatRelativeTime('2026-04-05T11:50:00.000Z', now, 'en-US')).toBe('10m ago');
  });

  it('selects quick actions by route from backend-provided fields', () => {
    const globalActions = [{ id: 'global', label: 'Global', command: 'skm config get' }];
    const projectActions = [{ id: 'project', label: 'Project', command: 'skm doctor' }];
    const presetActions = [{ id: 'preset', label: 'Preset', command: 'skm preset list' }];
    const configActions = [{ id: 'config', label: 'Config', command: 'skm config set skills-dir <path>' }];

    expect(
      pickQuickActions({
        route: { name: 'projects' },
        projectsQuickActions: globalActions,
      }),
    ).toEqual(globalActions);

    expect(
      pickQuickActions({
        route: { name: 'project-detail', projectId: 'p_1' },
        projectDetail: { quickActions: projectActions },
      }),
    ).toEqual(projectActions);

    expect(
      pickQuickActions({
        route: { name: 'presets' },
        presets: { quickActions: presetActions },
      }),
    ).toEqual(presetActions);

    expect(
      pickQuickActions({
        route: { name: 'config' },
        config: { quickActions: configActions },
      }),
    ).toEqual(configActions);
  });

  it('builds reference-aware preset delete confirmation messages', () => {
    const noRefMessage = buildPresetDeleteConfirmationMessage({
      name: 'frontend-v1',
      referenceCount: 0,
      referenceProjects: [],
    });
    expect(noRefMessage).toContain('确认删除技能集 frontend-v1 吗？');

    const withRefMessage = buildPresetDeleteConfirmationMessage({
      name: 'frontend-v1',
      referenceCount: 2,
      referenceProjects: [
        { projectId: 'p_a', projectPath: '/tmp/a' },
        { projectId: 'p_b', projectPath: '/tmp/b' },
      ],
    });
    expect(withRefMessage).toContain('技能集 frontend-v1 当前影响 2 个项目。');
    expect(withRefMessage).toContain('/tmp/a');
    expect(withRefMessage).toContain('/tmp/b');
    expect(withRefMessage).toContain('确认删除技能集 frontend-v1 吗？');

    const englishMessage = buildPresetDeleteConfirmationMessage(
      {
        name: 'frontend-v1',
        referenceCount: 2,
        referenceProjects: [{ projectId: 'p_a', projectPath: '/tmp/a' }],
      },
      'en-US',
    );
    expect(englishMessage).toContain('Preset frontend-v1 currently affects 2 project(s).');
    expect(englishMessage).toContain('Delete preset frontend-v1?');
  });

  it('builds readonly delete messages for dynamic presets', () => {
    const readonlyMessage = buildPresetDeleteConfirmationMessage({
      name: 'impeccable',
      referenceCount: 0,
      source: 'dynamic',
      readonly: true,
      referenceProjects: [],
    });

    expect(readonlyMessage).toContain('只读');
    expect(readonlyMessage).toContain('impeccable');
    expect(
      buildPresetDeleteConfirmationMessage(
        {
          name: 'impeccable',
          referenceCount: 0,
          source: 'dynamic',
          readonly: true,
          referenceProjects: [],
        },
        'en-US',
      ),
    ).toContain('readonly');
  });
});
