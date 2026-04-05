export function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderMessage(message: string): string {
  return `${message}\n`;
}
