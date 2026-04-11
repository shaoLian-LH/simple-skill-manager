export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}
