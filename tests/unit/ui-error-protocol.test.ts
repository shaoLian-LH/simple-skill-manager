import { describe, expect, it } from 'vitest';

import { SkmError } from '../../src/core/errors.js';
import { toApiErrorDetail, toHttpStatusCode } from '../../src/ui/server/errors.js';

describe('ui error protocol', () => {
  it('preserves SkmError kind/details/hint', () => {
    const error = new SkmError('conflict', 'Conflict happened.', {
      details: 'state mismatch',
      hint: 'Run sync first.',
    });

    expect(toHttpStatusCode(error)).toBe(409);
    expect(toApiErrorDetail(error)).toEqual({
      kind: 'conflict',
      message: 'Conflict happened.',
      details: 'state mismatch',
      hint: 'Run sync first.',
    });
  });

  it('maps unknown errors to runtime', () => {
    const error = new Error('boom');
    expect(toHttpStatusCode(error)).toBe(500);
    expect(toApiErrorDetail(error)).toEqual({
      kind: 'runtime',
      message: 'boom',
    });
  });

  it('localizes non-error runtime fallbacks by requested locale', () => {
    expect(toApiErrorDetail({})).toEqual({
      kind: 'runtime',
      message: '未知错误。',
    });

    expect(toApiErrorDetail({}, 'en-US')).toEqual({
      kind: 'runtime',
      message: 'Unknown failure.',
    });
  });

  it('localizes known upstream SkmError payloads and field errors', () => {
    const error = new SkmError(
      'conflict',
      'Preset impeccable is a dynamic scope preset and cannot be modified.',
      {
        hint:
          'Rename or remove the scope directory to change it, or create a different static preset name in `presets.yaml`.',
      },
    );

    expect(toApiErrorDetail(error)).toEqual({
      kind: 'conflict',
      message: '预设 impeccable 是动态作用域预设，无法修改。',
      hint: '如需修改，请重命名或移除对应作用域目录，或在 `presets.yaml` 中创建其他静态预设名。',
    });

    expect(toApiErrorDetail(error, 'en-US')).toEqual({
      kind: 'conflict',
      message: 'Preset impeccable is a dynamic scope preset and cannot be modified.',
      hint:
        'Rename or remove the scope directory to change it, or create a different static preset name in `presets.yaml`.',
    });
  });
});
