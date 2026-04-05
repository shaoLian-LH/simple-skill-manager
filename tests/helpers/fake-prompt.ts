import { PromptCancelledError, type PromptAdapter, type PromptChoice } from '../../src/cli/interactive/adapter.js';

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
  readonly calls = {
    selectOne: [] as Array<{ message: string; choices: PromptChoice[] }>,
    selectMany: [] as Array<{ message: string; choices: PromptChoice[]; options?: { initial?: string[]; min?: number } }>,
    confirm: [] as Array<{ message: string }>,
    input: [] as Array<{ message: string; options?: { defaultValue?: string } }>,
  };

  constructor(script: FakePromptScript = {}) {
    this.script = {
      selectOne: [...(script.selectOne ?? [])],
      selectMany: [...(script.selectMany ?? [])],
      confirm: [...(script.confirm ?? [])],
      input: [...(script.input ?? [])],
    };
  }

  async selectOne(message: string, choices: PromptChoice[]): Promise<string> {
    this.calls.selectOne.push({ message, choices });
    const value = shiftOrThrow(this.script.selectOne, 'selectOne');
    if (value === '__cancel__') {
      throw new PromptCancelledError();
    }
    return value;
  }

  async selectMany(message: string, choices: PromptChoice[], options?: { initial?: string[]; min?: number }): Promise<string[]> {
    this.calls.selectMany.push({ message, choices, options });
    const values = shiftOrThrow(this.script.selectMany, 'selectMany');
    if (values.length === 1 && values[0] === '__cancel__') {
      throw new PromptCancelledError();
    }
    return values;
  }

  async confirm(message: string): Promise<boolean> {
    this.calls.confirm.push({ message });
    return shiftOrThrow(this.script.confirm, 'confirm');
  }

  async input(message: string, options?: { defaultValue?: string }): Promise<string> {
    this.calls.input.push({ message, options });
    const value = shiftOrThrow(this.script.input, 'input');
    if (value === '__cancel__') {
      throw new PromptCancelledError();
    }
    return value;
  }
}
