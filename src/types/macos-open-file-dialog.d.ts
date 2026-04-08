declare module 'macos-open-file-dialog' {
  export function openFile(prompt: string, allowedTypes?: string[]): Promise<string>;
  export function openFolder(prompt: string): Promise<string>;
}
