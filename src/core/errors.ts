import type { ErrorKind } from './types.js';

export enum ExitCode {
  Success = 0,
  Usage = 2,
  Config = 3,
  Conflict = 4,
  Runtime = 5,
}

const EXIT_CODE_BY_KIND: Record<ErrorKind, ExitCode> = {
  usage: ExitCode.Usage,
  config: ExitCode.Config,
  conflict: ExitCode.Conflict,
  runtime: ExitCode.Runtime,
};

export class SkmError extends Error {
  readonly kind: ErrorKind;
  readonly hint?: string;
  readonly details?: string;

  constructor(kind: ErrorKind, message: string, options?: { hint?: string; details?: string; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'SkmError';
    this.kind = kind;
    this.hint = options?.hint;
    this.details = options?.details;
  }

  get exitCode(): ExitCode {
    return EXIT_CODE_BY_KIND[this.kind];
  }
}

export function isSkmError(error: unknown): error is SkmError {
  return error instanceof SkmError;
}

export function formatError(error: unknown): string {
  if (isSkmError(error)) {
    const lines = [`Error: ${error.message}`];
    if (error.details) {
      lines.push(`Details: ${error.details}`);
    }
    if (error.hint) {
      lines.push(`Next step: ${error.hint}`);
    }
    return lines.join('\n');
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return 'Error: Unknown failure';
}
