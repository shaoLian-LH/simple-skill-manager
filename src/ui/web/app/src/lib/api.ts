import type { ApiErrorDetail } from '../types';

interface ApiSuccessEnvelope<T> {
  ok: true;
  data: T;
}

interface ApiFailureEnvelope {
  ok: false;
  error: ApiErrorDetail;
}

type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiFailureEnvelope;

export class ApiRequestError extends Error {
  readonly detail: ApiErrorDetail;

  constructor(detail: ApiErrorDetail) {
    super(detail.message);
    this.detail = detail;
  }
}

export async function apiRequest<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(pathname, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.ok) {
    const detail = payload.ok
      ? {
          kind: 'runtime',
          message: `Request failed with status ${response.status}.`,
        }
      : payload.error;
    throw new ApiRequestError(detail);
  }

  return payload.data;
}
