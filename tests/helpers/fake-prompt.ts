import { PromptCancelledError, type PromptAdapter } from '../../src/cli/interactive/adapter.js';

interface FakePromptScript {
  selectOne?: string[];
  selectMany?: string[][];
  confirm?: boolean[];
  input?: string[];
}

function shiftOrThrow<T>(queue: T[] | undefined, label: string): T {
  if (!queue || queue.length === 0) {
    throw new Error(`No scripted value for ${label}.`);
  }
  return queue.shift() as T;
}

export class FakePromptAdapter implements PromptAdapter {
  private readonly script: Required<FakePromptScript>;

  constructor(script: FakePromptScript = {}) {
    this.script = {
      selectOne: [...(script.selectOne ?? [])],
      selectMany: [...(script.selectMany ?? [])],
      confirm: [...(script.confirm ?? [])],
      input: [...(script.input ?? [])],
    };
  }

  async selectOne(): Promise<string> {
    const value = shiftOrThrow(this.script.selectOne, 'selectOne');
    if (value === '__cancel__') {
      throw new PromptCancelledError();
    }
    return value;
  }

  async selectMany(): Promise<string[]> {
    const values = shiftOrThrow(this.script.selectMany, 'selectMany');
    if (values.length === 1 && values[0] === '__cancel__') {
      throw new PromptCancelledError();
    }
    return values;
  }

  async confirm(): Promise<boolean> {
    return shiftOrThrow(this.script.confirm, 'confirm');
  }

  async input(): Promise<string> {
    const value = shiftOrThrow(this.script.input, 'input');
    if (value === '__cancel__') {
      throw new PromptCancelledError();
    }
    return value;
  }
}
