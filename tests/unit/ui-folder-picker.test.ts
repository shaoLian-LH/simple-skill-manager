import { describe, expect, it } from 'vitest';

import { pickSkillsDirectory } from '../../src/ui/system/folder-picker.js';

describe('ui folder picker', () => {
  it('returns the picked path when the host picker resolves', async () => {
    const result = await pickSkillsDirectory({
      locale: 'en-US',
      picker: async () => '/tmp/skills',
    });

    expect(result).toEqual({
      path: '/tmp/skills',
      canceled: false,
    });
  });

  it('maps user cancellation to a non-error result', async () => {
    const result = await pickSkillsDirectory({
      locale: 'en-US',
      picker: async () => {
        throw new Error('execution error: User canceled. (-128)');
      },
    });

    expect(result).toEqual({
      path: null,
      canceled: true,
    });
  });

  it('wraps unexpected picker failures with a localized error', async () => {
    await expect(
      pickSkillsDirectory({
        locale: 'en-US',
        picker: async () => {
          throw new Error('native dialog exploded');
        },
      }),
    ).rejects.toMatchObject({
      kind: 'runtime',
      message: 'Folder picker failed.',
      hint: 'Paste the path manually or check whether this host allows the native folder picker.',
    });
  });
});
