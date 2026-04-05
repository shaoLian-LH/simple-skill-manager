import { checkbox as checkboxPrompt, confirm as confirmPrompt, input as inputPrompt, select as selectPrompt } from '@inquirer/prompts';

export interface PromptChoice {
  value: string;
  label: string;
  description?: string;
}

export interface PromptAdapter {
  selectOne(message: string, choices: PromptChoice[]): Promise<string>;
  selectMany(message: string, choices: PromptChoice[], options?: { initial?: string[]; min?: number }): Promise<string[]>;
  confirm(message: string): Promise<boolean>;
  input(message: string, options?: { defaultValue?: string }): Promise<string>;
}

export class PromptCancelledError extends Error {
  constructor(message = 'Prompt cancelled.') {
    super(message);
    this.name = 'PromptCancelledError';
  }
}

function isPromptCancellation(error: unknown): boolean {
  return error instanceof Error && (error.name === 'ExitPromptError' || error.name === 'AbortPromptError');
}

async function runPrompt<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      throw error;
    }
    if (isPromptCancellation(error)) {
      throw new PromptCancelledError();
    }
    throw error;
  }
}

function toNamedChoices(choices: PromptChoice[]): Array<{ value: string; name: string; short: string }> {
  return choices.map((choice) => ({
    value: choice.value,
    name: formatChoiceLabel(choice),
    short: choice.label,
  }));
}

function normalizeAnswer(answer: string): string {
  return answer.trim();
}

function formatChoiceLabel(choice: PromptChoice): string {
  return `${choice.label}`;
}

const PROMPT_PAGE_SIZE = 20;

export class TtyPromptAdapter implements PromptAdapter {
  async selectOne(message: string, choices: PromptChoice[]): Promise<string> {
    if (choices.length === 0) {
      throw new Error('selectOne requires at least one choice.');
    }

    return runPrompt(() =>
      selectPrompt({
        message,
        choices: toNamedChoices(choices),
        pageSize: PROMPT_PAGE_SIZE,
        theme: { indexMode: 'number' },
      }),
    );
  }

  async selectMany(message: string, choices: PromptChoice[], options: { initial?: string[]; min?: number } = {}): Promise<string[]> {
    const min = options.min ?? 1;
    const initial = new Set(options.initial ?? []);
    if (choices.length === 0) {
      return [];
    }

    return runPrompt(() =>
      checkboxPrompt({
        message,
        pageSize: PROMPT_PAGE_SIZE,
        choices: toNamedChoices(choices).map((choice) => ({
          ...choice,
          checked: initial.has(choice.value),
        })),
        validate: (selected) => (selected.length >= min ? true : `Please select at least ${min} option(s).`),
      }),
    );
  }

  async confirm(message: string): Promise<boolean> {
    return runPrompt(() => confirmPrompt({ message, default: false }));
  }

  async input(message: string, options: { defaultValue?: string } = {}): Promise<string> {
    const answer = await runPrompt(() =>
      inputPrompt({
        message,
        default: options.defaultValue,
        validate: (value) => (options.defaultValue || normalizeAnswer(value).length > 0 ? true : 'Input cannot be empty.'),
      }),
    );

    return normalizeAnswer(answer);
  }
}
