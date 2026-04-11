import { describe, expect, it } from 'vitest';

import { formatRelativeTime, getLastPathSegment, getProjectLabel } from '../../src/ui/web/src/lib/format.js';
import { buildPresetDeleteConfirmationMessage } from '../../src/ui/web/src/lib/preset.js';

describe('ui web app helpers', () => {
  it('derives friendly project labels from project paths', () => {
    expect(getLastPathSegment('/Users/demo/alpha')).toBe('alpha');
    expect(getLastPathSegment('C:\\Users\\demo\\beta\\')).toBe('beta');
    expect(getProjectLabel('/Users/demo/alpha')).toBe('alpha');
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

  it('builds preset delete confirmation messages from preview payloads', () => {
    const noReferenceMessage = buildPresetDeleteConfirmationMessage(
      {
        name: 'frontend-v1',
        referenceCount: 0,
        source: 'static',
        readonly: false,
        referenceProjects: [],
      },
      'zh-CN',
    );
    expect(noReferenceMessage).toContain('确认移除技能集 frontend-v1 吗？');

    const withReferenceMessage = buildPresetDeleteConfirmationMessage(
      {
        name: 'frontend-v1',
        referenceCount: 2,
        source: 'static',
        readonly: false,
        referenceProjects: [
          { projectId: 'p_a', projectPath: '/tmp/a', displayName: 'a' },
          { projectId: 'p_b', projectPath: '/tmp/b', displayName: 'b' },
        ],
      },
      'zh-CN',
    );
    expect(withReferenceMessage).toContain('技能集 frontend-v1 当前影响 2 个项目。');
    expect(withReferenceMessage).toContain('/tmp/a');
    expect(withReferenceMessage).toContain('/tmp/b');

    const englishMessage = buildPresetDeleteConfirmationMessage(
      {
        name: 'frontend-v1',
        referenceCount: 9,
        source: 'static',
        readonly: false,
        referenceProjects: Array.from({ length: 9 }, (_, index) => ({
          projectId: `p_${index}`,
          projectPath: `/tmp/${index}`,
          displayName: `${index}`,
        })),
      },
      'en-US',
    );
    expect(englishMessage).toContain('Preset frontend-v1 currently affects 9 project(s).');
    expect(englishMessage).toContain('/tmp/0');
    expect(englishMessage).toContain('- ...');
  });
});
