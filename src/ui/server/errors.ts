import { SkmError } from '../../core/errors.js';
import type { ApiErrorDetail } from '../contracts/api.js';

export class UiValidationError extends SkmError {
  readonly fieldErrors?: Record<string, string>;

  constructor(
    kind: 'usage' | 'config' | 'conflict',
    message: string,
    options?: { hint?: string; details?: string; fieldErrors?: Record<string, string>; cause?: unknown },
  ) {
    super(kind, message, options);
    this.name = 'UiValidationError';
    this.fieldErrors = options?.fieldErrors;
  }
}

export function toApiErrorDetail(error: unknown): ApiErrorDetail {
  if (error instanceof UiValidationError) {
    return {
      kind: error.kind,
      message: error.message,
      details: error.details,
      hint: error.hint,
      fieldErrors: error.fieldErrors,
    };
  }

  if (error instanceof SkmError) {
    return {
      kind: error.kind,
      message: error.message,
      details: error.details,
      hint: error.hint,
    };
  }

  if (error instanceof Error) {
    return {
      kind: 'runtime',
      message: error.message,
    };
  }

  return {
    kind: 'runtime',
    message: 'Unknown failure.',
  };
}

export function toHttpStatusCode(error: unknown): number {
  if (!(error instanceof SkmError)) {
    return 500;
  }

  switch (error.kind) {
    case 'usage':
      return 400;
    case 'config':
      return 400;
    case 'conflict':
      return 409;
    case 'runtime':
      return 500;
    default:
      return 500;
  }
}
