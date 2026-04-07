import { describe, expect, it } from 'vitest';

import { SkmError } from '../../src/core/errors.js';
import { decodeProjectId, encodeProjectId } from '../../src/ui/facade/project-id.js';

describe('ui projectId compat mapping', () => {
  it('encodes and decodes project paths reversibly', () => {
    const projectPath = '/tmp/skm projects/demo-project';
    const projectId = encodeProjectId(projectPath);

    expect(projectId.startsWith('p_')).toBe(true);
    expect(decodeProjectId(projectId)).toBe(projectPath);
  });

  it('rejects malformed project ids', () => {
    expect(() => decodeProjectId('demo')).toThrow(SkmError);
    expect(() => decodeProjectId('p_')).toThrow(SkmError);
  });
});

