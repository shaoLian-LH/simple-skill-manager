import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}));

import { checkbox, confirm, input, select } from '@inquirer/prompts';

import { PromptCancelledError, TtyPromptAdapter } from '../../src/cli/interactive/adapter.js';

describe('TtyPromptAdapter', () => {
  const adapter = new TtyPromptAdapter();
  const mockedCheckbox = vi.mocked(checkbox);
  const mockedConfirm = vi.mocked(confirm);
  const mockedInput = vi.mocked(input);
  const mockedSelect = vi.mocked(select);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses inquirer select for single selection', async () => {
    mockedSelect.mockResolvedValueOnce('brainstorming');

    await expect(
      adapter.selectOne('Select a skill to inspect', [
        { value: 'brainstorming', label: 'brainstorming', description: 'Generate many candidate ideas quickly.' },
        { value: 'test-engineer', label: 'test-engineer' },
      ]),
    ).resolves.toBe('brainstorming');

    expect(mockedSelect).toHaveBeenCalledOnce();
    expect(mockedSelect).toHaveBeenCalledWith({
      message: 'Select a skill to inspect',
      choices: [
        {
          value: 'brainstorming',
          name: 'brainstorming',
          short: 'brainstorming',
        },
        { value: 'test-engineer', name: 'test-engineer', short: 'test-engineer' },
      ],
      pageSize: 20,
      theme: { indexMode: 'number' },
    });
  });

  it('uses inquirer checkbox with defaults and min-selection validation', async () => {
    mockedCheckbox.mockResolvedValueOnce(['.agents', '.trae']);

    const selected = await adapter.selectMany(
      'Select targets',
      [
        { value: '.agents', label: '.agents', description: 'Install into .agents/skills.' },
        { value: '.trae', label: '.trae' },
      ],
      { initial: ['.agents'], min: 2 },
    );

    expect(selected).toEqual(['.agents', '.trae']);
    expect(mockedCheckbox).toHaveBeenCalledOnce();

    const config = mockedCheckbox.mock.calls[0]?.[0];
    expect(config?.pageSize).toBe(20);
    expect(config?.choices).toEqual([
      {
        value: '.agents',
        name: '.agents',
        short: '.agents',
        checked: true,
      },
      { value: '.trae', name: '.trae', short: '.trae', checked: false },
    ]);
    expect(await config?.validate?.([] as never[])).toBe('Please select at least 2 option(s).');
    expect(await config?.validate?.([{} as never, {} as never])).toBe(true);
  });

  it('uses inquirer confirm with a false default', async () => {
    mockedConfirm.mockResolvedValueOnce(false);

    await expect(adapter.confirm('Delete preset frontend-basic?')).resolves.toBe(false);

    expect(mockedConfirm).toHaveBeenCalledOnce();
    expect(mockedConfirm).toHaveBeenCalledWith({
      message: 'Delete preset frontend-basic?',
      default: false,
    });
  });

  it('uses inquirer input and preserves default value support', async () => {
    mockedInput.mockResolvedValueOnce('  frontend-basic  ');

    await expect(adapter.input('Preset name', { defaultValue: 'starter' })).resolves.toBe('frontend-basic');

    expect(mockedInput).toHaveBeenCalledOnce();
    const config = mockedInput.mock.calls[0]?.[0];
    expect(config?.message).toBe('Preset name');
    expect(config?.default).toBe('starter');
    expect(await config?.validate?.('')).toBe(true);
  });

  it('rejects empty input when no default value is configured', async () => {
    mockedInput.mockResolvedValueOnce('preset-name');

    await adapter.input('Preset name');

    const config = mockedInput.mock.calls[0]?.[0];
    expect(await config?.validate?.('   ')).toBe('Input cannot be empty.');
    expect(await config?.validate?.(' preset-name ')).toBe(true);
  });

  it('maps prompt cancellation errors to PromptCancelledError', async () => {
    mockedSelect.mockRejectedValueOnce(Object.assign(new Error('User force closed the prompt with 0 null'), { name: 'ExitPromptError' }));
    mockedInput.mockRejectedValueOnce(Object.assign(new Error('Prompt aborted'), { name: 'AbortPromptError' }));

    await expect(adapter.selectOne('Select a skill', [{ value: 'brainstorming', label: 'brainstorming' }])).rejects.toBeInstanceOf(PromptCancelledError);
    await expect(adapter.input('Preset name')).rejects.toBeInstanceOf(PromptCancelledError);
  });
});
