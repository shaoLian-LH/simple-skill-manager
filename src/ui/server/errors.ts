import { SkmError } from '../../core/errors.js';
import { SUPPORTED_TARGETS } from '../../core/types.js';
import type { ApiErrorDetail } from '../contracts/api.js';
import { DEFAULT_UI_LOCALE, translateUiText, type UiLocale } from '../text.js';

export class UiValidationError extends SkmError {
  readonly fieldErrors?: Record<string, string>;

  constructor(
    kind: 'usage' | 'config' | 'conflict',
    message: string,
    options?: { hint?: string; details?: string; fieldErrors?: Record<string, string>; cause?: unknown },
  ) {
    super(kind, message, options);
    this.name = 'UiValidationError';
    this.fieldErrors = options?.fieldErrors;
  }
}

function localizeSkmMessage(message: string, locale: UiLocale): string {
  const skillsDirMissingMatch = message.match(/^Skills directory does not exist: (.+)\.$/);
  if (skillsDirMissingMatch) {
    return translateUiText(locale, 'server.upstream.skillsDirMissing', {
      path: skillsDirMissingMatch[1] ?? '',
    });
  }

  const skillsDirNotDirectoryMatch = message.match(/^Skills directory is not a directory: (.+)\.$/);
  if (skillsDirNotDirectoryMatch) {
    return translateUiText(locale, 'server.upstream.skillsDirNotDirectory', {
      path: skillsDirNotDirectoryMatch[1] ?? '',
    });
  }

  const unsupportedTargetMatch = message.match(/^Unsupported target "(.+)"\.$/);
  if (unsupportedTargetMatch) {
    return translateUiText(locale, 'server.upstream.unsupportedTarget', {
      target: unsupportedTargetMatch[1] ?? '',
    });
  }

  const presetDefinitionsMissingMatch = message.match(/^Preset definitions are missing for (.+)\.$/);
  if (presetDefinitionsMissingMatch) {
    return translateUiText(locale, 'server.upstream.presetDefinitionsMissing', {
      names: presetDefinitionsMissingMatch[1] ?? '',
    });
  }

  const presetReadonlyMatch = message.match(/^Preset (.+) is a dynamic scope preset and cannot be modified\.$/);
  if (presetReadonlyMatch) {
    return translateUiText(locale, 'server.upstream.presetReadonly', {
      name: presetReadonlyMatch[1] ?? '',
    });
  }

  const presetNotFoundMatch = message.match(/^Preset (.+) was not found\.$/);
  if (presetNotFoundMatch) {
    return translateUiText(locale, 'server.upstream.presetNotFound', {
      name: presetNotFoundMatch[1] ?? '',
    });
  }

  const presetNameConflictMatch = message.match(
    /^Preset name (.+) is defined both statically and as a dynamic scope preset\.$/,
  );
  if (presetNameConflictMatch) {
    return translateUiText(locale, 'server.upstream.presetNameConflict', {
      name: presetNameConflictMatch[1] ?? '',
    });
  }

  const presetUnknownSkillsMatch = message.match(/^Preset references unknown skill\(s\): (.+)\.$/);
  if (presetUnknownSkillsMatch) {
    return translateUiText(locale, 'server.upstream.presetUnknownSkills', {
      names: presetUnknownSkillsMatch[1] ?? '',
    });
  }

  const skillNotFoundMatch = message.match(/^Skill (.+) was not found in (.+)\.$/);
  if (skillNotFoundMatch) {
    return translateUiText(locale, 'server.upstream.skillNotFound', {
      name: skillNotFoundMatch[1] ?? '',
    });
  }

  switch (message) {
    case 'At least one config field is required.':
      return translateUiText(locale, 'server.upstream.configFieldRequired');
    case 'At least one skill name is required.':
      return translateUiText(locale, 'server.upstream.skillNameRequired');
    case 'At least one preset name is required.':
      return translateUiText(locale, 'server.upstream.presetNameRequired');
    case 'Preset skills cannot be empty.':
      return translateUiText(locale, 'server.upstream.presetSkillsRequired');
    case 'At least one target is required for global enable operations.':
      return translateUiText(locale, 'server.upstream.enableGlobalTargetRequired');
    case 'At least one target is required to enable skills or presets.':
      return translateUiText(locale, 'server.upstream.enableTargetRequired');
    default:
      return message;
  }
}

function localizeSkmHint(hint: string, locale: UiLocale): string {
  switch (hint) {
    case 'Provide `skillsDir` and/or `defaultTargets`.':
      return translateUiText(locale, 'server.upstream.configFieldRequiredHint');
    case 'Create the directory first, then update `skillsDir` again.':
      return translateUiText(locale, 'server.upstream.skillsDirMissingHint');
    case 'Choose an existing directory for `skillsDir`.':
      return translateUiText(locale, 'server.upstream.skillsDirNotDirectoryHint');
    case 'Pass `--target <target>` or first establish global targets through an interactive selection.':
      return translateUiText(locale, 'server.upstream.enableGlobalTargetRequiredHint');
    case 'Pass `--target <target>` or configure `defaultTargets` in `config.json`.':
      return translateUiText(locale, 'server.upstream.enableTargetRequiredHint');
    case 'Run `skm skill list` and use only existing skill names in preset definitions.':
      return translateUiText(locale, 'server.upstream.presetUnknownSkillsHint');
    case 'Check `skm preset list` to see the available presets.':
      return translateUiText(locale, 'server.upstream.presetNotFoundHint');
    case 'Rename the preset in `presets.yaml` or rename the scope directory to remove the ambiguity.':
      return translateUiText(locale, 'server.upstream.presetNameConflictHint');
    case 'Rename or remove the scope directory to change it, or create a different static preset name in `presets.yaml`.':
      return translateUiText(locale, 'server.upstream.presetReadonlyHint');
    case 'Run `skm skill enable <name...>`.':
    case 'Run `skm skill disable <name...>`.':
      return translateUiText(locale, 'server.upstream.skillNameRequiredHint');
    case 'Run `skm preset enable <name...>`.':
    case 'Run `skm preset disable <name...>`.':
      return translateUiText(locale, 'server.upstream.presetNameRequiredHint');
    case 'Provide at least one skill name.':
      return translateUiText(locale, 'server.upstream.presetSkillsRequiredHint');
    case 'Check `skm skill list` to see the available skills.':
      return translateUiText(locale, 'server.upstream.skillNotFoundHint');
    default: {
      const unsupportedTargetHintMatch = hint.match(/^Use one of: (.+)$/);
      if (unsupportedTargetHintMatch) {
        return translateUiText(locale, 'server.upstream.unsupportedTargetHint', {
          targets: unsupportedTargetHintMatch[1] ?? SUPPORTED_TARGETS.join(', '),
        });
      }

      const presetDefinitionsMissingHintMatch = hint.match(
        /^Recreate the missing presets or run `skm preset disable (.+)` in this scope\.$/,
      );
      if (presetDefinitionsMissingHintMatch) {
        return translateUiText(locale, 'server.upstream.presetDefinitionsMissingHint', {
          names: presetDefinitionsMissingHintMatch[1] ?? '',
        });
      }

      return hint;
    }
  }
}

function localizeSkmDetails(details: string, locale: UiLocale): string {
  const configuredSkillsDirMatch = details.match(/^Configured skills directory: (.+)\.$/);
  if (configuredSkillsDirMatch) {
    return translateUiText(locale, 'server.upstream.configuredSkillsDir', {
      path: configuredSkillsDirMatch[1] ?? '',
    });
  }

  return details;
}

function localizeFieldErrors(
  fieldErrors: Record<string, string> | undefined,
  locale: UiLocale,
): Record<string, string> | undefined {
  if (!fieldErrors) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, message]) => [field, localizeSkmMessage(message, locale)]),
  );
}

export function toApiErrorDetail(error: unknown, locale: UiLocale = DEFAULT_UI_LOCALE): ApiErrorDetail {
  if (error instanceof UiValidationError) {
    return {
      kind: error.kind,
      message: localizeSkmMessage(error.message, locale),
      details: error.details ? localizeSkmDetails(error.details, locale) : undefined,
      hint: error.hint ? localizeSkmHint(error.hint, locale) : undefined,
      fieldErrors: localizeFieldErrors(error.fieldErrors, locale),
    };
  }

  if (error instanceof SkmError) {
    return {
      kind: error.kind,
      message: localizeSkmMessage(error.message, locale),
      details: error.details ? localizeSkmDetails(error.details, locale) : undefined,
      hint: error.hint ? localizeSkmHint(error.hint, locale) : undefined,
    };
  }

  if (error instanceof Error) {
    return {
      kind: 'runtime',
      message: error.message,
    };
  }

  return {
    kind: 'runtime',
    message: translateUiText(locale, 'server.unknownFailure'),
  };
}

export function toHttpStatusCode(error: unknown): number {
  if (!(error instanceof SkmError)) {
    return 500;
  }

  switch (error.kind) {
    case 'usage':
      return 400;
    case 'config':
      return 400;
    case 'conflict':
      return 409;
    case 'runtime':
      return 500;
    default:
      return 500;
  }
}
