import { SkmError } from '../../core/errors.js';
import type { TargetName } from '../../core/types.js';
import { SUPPORTED_TARGETS } from '../../core/types.js';
import type { PromptAdapter, PromptChoice } from './adapter.js';

function stableUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values.map((entry) => entry.trim()).filter((entry) => entry.length > 0)) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }
  return next;
}

export interface CollectContext {
  canPrompt: boolean;
  prompt: PromptAdapter;
}

function normalizeChoices(options: Array<string | PromptChoice>): PromptChoice[] {
  return options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option));
}

export function ensurePromptable(context: CollectContext, message: string, hint: string): void {
  if (context.canPrompt) {
    return;
  }

  throw new SkmError('usage', message, { hint });
}

export async function collectSingle(
  context: CollectContext,
  provided: string | undefined,
  options: Array<string | PromptChoice>,
  message: string,
  usageMessage: string,
  usageHint: string,
): Promise<{ value: string; usedPrompt: boolean }> {
  if (provided && provided.trim().length > 0) {
    return { value: provided.trim(), usedPrompt: false };
  }

  ensurePromptable(context, usageMessage, usageHint);
  const choices = normalizeChoices(options);
  if (choices.length === 0) {
    throw new SkmError('usage', usageMessage, { hint: usageHint });
  }

  const value = await context.prompt.selectOne(message, choices);
  return { value, usedPrompt: true };
}

export async function collectMany(
  context: CollectContext,
  provided: string[] | undefined,
  options: Array<string | PromptChoice>,
  message: string,
  usageMessage: string,
  usageHint: string,
  initial: string[] = [],
): Promise<{ values: string[]; usedPrompt: boolean }> {
  const normalized = stableUnique(provided ?? []);
  if (normalized.length > 0) {
    return { values: normalized, usedPrompt: false };
  }

  ensurePromptable(context, usageMessage, usageHint);
  const choices = normalizeChoices(options);
  if (choices.length === 0) {
    return { values: [], usedPrompt: true };
  }

  const values = await context.prompt.selectMany(message, choices, {
    min: 1,
    initial: stableUnique(initial),
  });
  return { values: stableUnique(values), usedPrompt: true };
}

export async function collectTargets(
  context: CollectContext,
  provided: string[] | undefined,
  initial: string[],
): Promise<{ targets: string[]; usedPrompt: boolean }> {
  const normalized = stableUnique(provided ?? []);
  if (normalized.length > 0) {
    return { targets: normalized, usedPrompt: false };
  }

  if (!context.canPrompt) {
    return { targets: [], usedPrompt: false };
  }

  const targets = await context.prompt.selectMany(
    'Select targets',
    SUPPORTED_TARGETS.map((target) => ({
      value: target,
      label: target,
      description: `Install skills into ${target}/skills in the current project.`,
    })),
    { min: 1, initial: stableUnique(initial) },
  );

  return {
    targets: stableUnique(targets).filter((target): target is TargetName => SUPPORTED_TARGETS.includes(target as TargetName)),
    usedPrompt: true,
  };
}
