import { describe, expect, it } from 'vitest';

import { quickOpenPath, quickOpenProjectPath } from '../../src/ui/system/quick-open.js';

describe('quick open project path', () => {
  it('opens arbitrary directories through the shared quick-open helper', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const result = await quickOpenPath('/tmp/skills', async (command, args) => {
      calls.push({ command, args });
      if (command !== 'code') {
        throw new Error('unexpected fallback');
      }
    });

    expect(calls).toEqual([{ command: 'code', args: ['/tmp/skills'] }]);
    expect(result).toEqual({
      success: true,
      strategy: 'code',
      message: '已在 VS Code 中打开项目。',
    });
  });

  it('uses code strategy when code command succeeds', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const result = await quickOpenProjectPath('/tmp/project', async (command, args) => {
      calls.push({ command, args });
      if (command !== 'code') {
        throw new Error('unexpected fallback');
      }
    });

    expect(calls).toEqual([{ command: 'code', args: ['/tmp/project'] }]);
    expect(result).toEqual({
      success: true,
      strategy: 'code',
      message: '已在 VS Code 中打开项目。',
    });
  });

  it('supports explicit english locale for success messages', async () => {
    const result = await quickOpenProjectPath(
      '/tmp/project',
      async (command) => {
        if (command !== 'code') {
          throw new Error('unexpected fallback');
        }
      },
      'en-US',
    );

    expect(result).toEqual({
      success: true,
      strategy: 'code',
      message: 'Opened the project in VS Code.',
    });
  });

  it('falls back to system default opener when code fails', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const result = await quickOpenProjectPath('/tmp/project', async (command, args) => {
      calls.push({ command, args });
      if (command === 'code') {
        throw new Error('code missing');
      }
    });

    expect(calls[0]).toEqual({ command: 'code', args: ['/tmp/project'] });
    expect(calls[1]?.command).not.toBe('code');
    expect(result.success).toBe(true);
    expect(result.strategy).toBe('default');
  });

  it('returns structured failure when both strategies fail', async () => {
    const result = await quickOpenProjectPath('/tmp/project', async (command) => {
      if (command === 'code') {
        throw new Error('code failed');
      }
      throw new Error('default failed');
    });

    expect(result.success).toBe(false);
    expect(result.strategy).toBe(null);
    expect(result.message).toContain('code failed');
    expect(result.message).toContain('default failed');
  });
});
