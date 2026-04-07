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
});

