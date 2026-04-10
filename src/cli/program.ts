import { Command, CommanderError } from 'commander';

import {
  disablePresets,
  disableSkills,
  doctorGlobal,
  doctorProject,
  enablePresets,
  enableSkills,
  syncGlobal,
  syncProject,
} from '../core/activation/service.js';
import { loadConfig, initGlobalConfig, setSkillsDir } from '../core/config/service.js';
import { ExitCode, SkmError, formatError } from '../core/errors.js';
import { renderJson, renderMessage } from '../core/output/render.js';
import {
  addPresetDefinition,
  deletePresetDefinition,
  findPresetReferences,
  getPresetByName,
  listPresetDefinitions,
  listStaticPresets,
  updatePresetDefinition,
} from '../core/registry/presets.js';
import { getSkillByName, listSkills, toSkillInspectView } from '../core/registry/skills.js';
import { loadGlobalState } from '../core/state/global-state.js';
import { loadProjectState } from '../core/state/project-state.js';
import type { ActivationScope, ActivationState, PresetDefinition } from '../core/types.js';
import { toDisplayPath } from '../core/utils/path.js';
import { runUiCommand, type UiCommandRuntime } from '../ui/server/runtime.js';
import { PromptCancelledError, type PromptAdapter, type PromptChoice, TtyPromptAdapter } from './interactive/adapter.js';
import { collectMany, collectSingle, collectTargets, ensurePromptable } from './interactive/collector.js';

function printStdout(payload: string): void {
  process.stdout.write(payload);
}

function printStderr(payload: string): void {
  process.stderr.write(payload);
}

function collectTargetsOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

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

function parsePortOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new SkmError('usage', `Invalid port: ${value}.`, {
      hint: 'Provide a port between 1 and 65535.',
    });
  }

  return parsed;
}

function createNamedChoices(values: string[]): PromptChoice[] {
  return values.map((value) => ({ value, label: value }));
}

function createSkillChoices(skills: Array<{ name: string; description: string }>): PromptChoice[] {
  return skills.map((skill) => ({
    value: skill.name,
    label: skill.name,
    description: skill.description,
  }));
}

function formatPresetChoiceDescription(skills: string[]): string {
  if (skills.length === 0) {
    return 'No skills configured.';
  }

  const skillLabel = skills.length === 1 ? '1 skill' : `${skills.length} skills`;
  return `${skillLabel}: ${skills.join(', ')}`;
}

function createPresetChoices(presets: PresetDefinition[]): PromptChoice[] {
  return presets
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((preset) => ({
      value: preset.name,
      label: preset.name,
      description: `${formatPresetChoiceDescription(preset.skills)}${preset.readonly ? ' · dynamic scope' : ''}`,
    }));
}

async function withLoadedConfig<T>(callback: (skillsDir: string) => Promise<T>): Promise<T> {
  const { config } = await loadConfig();
  return callback(config.skillsDir);
}

function scopeLabel(scope: ActivationScope): string {
  return scope === 'global' ? 'globally' : 'in the current project';
}

function scopeNoun(scope: ActivationScope): string {
  return scope === 'global' ? 'global' : 'project';
}

async function loadScopeState(scope: ActivationScope, cwd: string): Promise<ActivationState | null> {
  if (scope === 'global') {
    const { paths } = await loadConfig();
    return loadGlobalState(paths);
  }

  return loadProjectState(cwd);
}

export interface CliDependencies {
  promptAdapter?: PromptAdapter;
  isInteractiveSession?: () => boolean;
  uiRuntime?: UiCommandRuntime;
}

function createProgram(deps: CliDependencies = {}): Command {
  const program = new Command();
  const prompt = deps.promptAdapter ?? new TtyPromptAdapter();
  const canPrompt = deps.isInteractiveSession ?? (() => Boolean(process.stdin.isTTY && process.stdout.isTTY));
  const uiRuntime = deps.uiRuntime ?? { run: runUiCommand };

  program
    .name('skm')
    .description('Manage globally registered skills and project-local target linking.')
    .showHelpAfterError()
    .exitOverride();

  const configCommand = program.command('config').description('Manage global simple-skill-manager configuration.');

  configCommand
    .command('init')
    .description('Initialize the global simple-skill-manager directory and default files.')
    .action(async () => {
      const result = await initGlobalConfig();
      printStdout(
        renderJson({
          appDir: result.paths.appDir,
          created: result.created.map(toDisplayPath),
          skipped: result.skipped.map(toDisplayPath),
        }),
      );
    });

  configCommand
    .command('get')
    .description('Print the current global configuration.')
    .action(async () => {
      const { config, paths } = await loadConfig();
      printStdout(renderJson({ ...config, appDir: paths.appDir }));
    });

  configCommand
    .command('set')
    .description('Update a global configuration field.')
    .command('skills-dir <path>')
    .description('Set the global skills directory to an existing path.')
    .action(async (nextPath: string) => {
      const config = await setSkillsDir(nextPath);
      printStdout(renderJson(config));
    });

  const skillCommand = program.command('skill').description('Inspect and manage globally available skills in this project.');

  skillCommand
    .command('list')
    .description('List all discovered skills in the configured skillsDir.')
    .action(async () => {
      const skills = await withLoadedConfig((skillsDir) => listSkills(skillsDir));
      printStdout(
        renderJson(
          skills.map((skill) => ({
            name: skill.name,
            path: skill.dirPath,
            description: skill.description,
          })),
        ),
      );
    });

  skillCommand
    .command('inspect [name]')
    .description('Show the source path, frontmatter, and preview for a skill.')
    .action(async (name: string | undefined) => {
      const availableSkills = await withLoadedConfig((skillsDir) => listSkills(skillsDir));
      if (!name && availableSkills.length === 0) {
        printStdout(renderMessage('No skills are available to inspect.'));
        return;
      }
      const collected = await collectSingle(
        { canPrompt: canPrompt(), prompt },
        name,
        createSkillChoices(availableSkills),
        'Select a skill to inspect',
        'Skill name is required in non-interactive mode.',
        'Run `skm skill inspect <name>`.',
      );
      const skill = await withLoadedConfig((skillsDir) => getSkillByName(skillsDir, collected.value));
      printStdout(renderJson(toSkillInspectView(skill)));
    });

  skillCommand
    .command('on [names...]')
    .description('Turn on one or more skills in the selected scope and install them into selected targets.')
    .option('-t, --target <target>', 'Target root to install into. Repeat to install into multiple targets.', collectTargetsOption, [])
    .option('--global', 'Turn on in global scope instead of the current project.')
    .action(async (names: string[] | undefined, options: { target: string[]; global?: boolean }) => {
      const scope: ActivationScope = options.global ? 'global' : 'project';
      const availableSkills = await withLoadedConfig((skillsDir) => listSkills(skillsDir));
      if ((!names || names.length === 0) && availableSkills.length === 0) {
        printStdout(renderMessage('No skills are available to turn on.'));
        return;
      }
      const previousState = await loadScopeState(scope, process.cwd());
      const selectedSkills = await collectMany(
        { canPrompt: canPrompt(), prompt },
        names,
        createSkillChoices(availableSkills),
        'Select skills to turn on',
        'At least one skill name is required in non-interactive mode.',
        'Run `skm skill on <name...> --target <target>`.',
        previousState?.enabledSkills ?? [],
      );

      const { config } = await loadConfig();
      const defaultTargets =
        previousState && Object.keys(previousState.targets).length > 0
          ? Object.keys(previousState.targets)
          : scope === 'project'
            ? config.defaultTargets
            : [];
      const selectedTargets = await collectTargets({ canPrompt: canPrompt(), prompt }, options.target, defaultTargets, scope);

      if (selectedSkills.usedPrompt || selectedTargets.usedPrompt) {
        const confirmed = await prompt.confirm(
          `Turn on skills [${selectedSkills.values.join(', ')}] ${scopeLabel(scope)} with targets [${(selectedTargets.targets.length > 0 ? selectedTargets.targets : defaultTargets).join(', ')}]?`,
        );
        if (!confirmed) {
          throw new PromptCancelledError();
        }
      }

      const state = await enableSkills({
        scope,
        projectPath: scope === 'project' ? process.cwd() : undefined,
        skillNames: selectedSkills.values,
        targets: selectedTargets.targets,
      });
      printStdout(renderJson(state));
    });

  skillCommand
    .command('off [names...]')
    .description('Turn off one or more explicitly enabled skills in the selected scope.')
    .option('--global', 'Turn off from global scope instead of the current project.')
    .action(async (names: string[] | undefined, options: { global?: boolean }) => {
      const scope: ActivationScope = options.global ? 'global' : 'project';
      const previousState = await loadScopeState(scope, process.cwd());
      const enabledSkills = previousState?.enabledSkills ?? [];
      const selected = await collectMany(
        { canPrompt: canPrompt(), prompt },
        names,
        createNamedChoices(enabledSkills),
        'Select skills to turn off',
        'At least one skill name is required in non-interactive mode.',
        'Run `skm skill off <name...>`.',
      );

      if (selected.values.length === 0) {
        printStdout(renderMessage('No enabled skills to turn off.'));
        return;
      }

      if (selected.usedPrompt) {
        const confirmed = await prompt.confirm(`Turn off skills [${selected.values.join(', ')}] from the ${scopeNoun(scope)} scope?`);
        if (!confirmed) {
          throw new PromptCancelledError();
        }
      }

      const state = await disableSkills({
        scope,
        projectPath: scope === 'project' ? process.cwd() : undefined,
        skillNames: selected.values,
      });
      printStdout(renderJson(state));
    });

  const presetCommand = program.command('preset').description('Inspect, manage, and apply globally configured skill presets.');

  presetCommand
    .command('list')
    .description('List all configured presets.')
    .action(async () => {
      const presets = await listPresetDefinitions();
      printStdout(
        renderJson(
          presets.map((preset) => ({
            name: preset.name,
            skillCount: preset.skills.length,
            source: preset.source,
            readonly: preset.readonly,
          })),
        ),
      );
    });

  presetCommand
    .command('inspect [name]')
    .description('Expand and print the skills in a preset.')
    .action(async (name: string | undefined) => {
      const presets = await listPresetDefinitions();
      if (!name && presets.length === 0) {
        printStdout(renderMessage('No presets are available to inspect.'));
        return;
      }
      const collected = await collectSingle(
        { canPrompt: canPrompt(), prompt },
        name,
        createPresetChoices(presets),
        'Select a preset to inspect',
        'Preset name is required in non-interactive mode.',
        'Run `skm preset inspect <name>`.',
      );
      const skills = await getPresetByName(collected.value);
      const preset = presets.find((entry) => entry.name === collected.value);
      printStdout(renderJson({ name: collected.value, skills, source: preset?.source ?? 'static', readonly: preset?.readonly ?? false }));
    });

  presetCommand
    .command('on [names...]')
    .description('Turn on one or more presets in the selected scope and install their skills into selected targets.')
    .option('-t, --target <target>', 'Target root to install into. Repeat to install into multiple targets.', collectTargetsOption, [])
    .option('--global', 'Turn on in global scope instead of the current project.')
    .action(async (names: string[] | undefined, options: { target: string[]; global?: boolean }) => {
      const scope: ActivationScope = options.global ? 'global' : 'project';
      const presets = await listPresetDefinitions();
      const previousState = await loadScopeState(scope, process.cwd());
      const selectedPresets = await collectMany(
        { canPrompt: canPrompt(), prompt },
        names,
        createPresetChoices(presets),
        'Select presets to turn on',
        'At least one preset name is required in non-interactive mode.',
        'Run `skm preset on <name...> --target <target>`.',
        previousState?.enabledPresets ?? [],
      );

      if (selectedPresets.values.length === 0) {
        printStdout(renderMessage('No presets are available to turn on.'));
        return;
      }

      const { config } = await loadConfig();
      const defaultTargets =
        previousState && Object.keys(previousState.targets).length > 0
          ? Object.keys(previousState.targets)
          : scope === 'project'
            ? config.defaultTargets
            : [];
      const selectedTargets = await collectTargets({ canPrompt: canPrompt(), prompt }, options.target, defaultTargets, scope);

      if (selectedPresets.usedPrompt || selectedTargets.usedPrompt) {
        const confirmed = await prompt.confirm(
          `Turn on presets [${selectedPresets.values.join(', ')}] ${scopeLabel(scope)} with targets [${(selectedTargets.targets.length > 0 ? selectedTargets.targets : defaultTargets).join(', ')}]?`,
        );
        if (!confirmed) {
          throw new PromptCancelledError();
        }
      }

      const state = await enablePresets({
        scope,
        projectPath: scope === 'project' ? process.cwd() : undefined,
        presetNames: selectedPresets.values,
        targets: selectedTargets.targets,
      });
      printStdout(renderJson(state));
    });

  presetCommand
    .command('off [names...]')
    .description('Turn off one or more presets in the selected scope.')
    .option('--global', 'Turn off from global scope instead of the current project.')
    .action(async (names: string[] | undefined, options: { global?: boolean }) => {
      const scope: ActivationScope = options.global ? 'global' : 'project';
      const previousState = await loadScopeState(scope, process.cwd());
      const enabledPresets = previousState?.enabledPresets ?? [];
      const selected = await collectMany(
        { canPrompt: canPrompt(), prompt },
        names,
        createNamedChoices(enabledPresets),
        'Select presets to turn off',
        'At least one preset name is required in non-interactive mode.',
        'Run `skm preset off <name...>`.',
      );

      if (selected.values.length === 0) {
        printStdout(renderMessage('No enabled presets to turn off.'));
        return;
      }

      if (selected.usedPrompt) {
        const confirmed = await prompt.confirm(`Turn off presets [${selected.values.join(', ')}] from the ${scopeNoun(scope)} scope?`);
        if (!confirmed) {
          throw new PromptCancelledError();
        }
      }

      const state = await disablePresets({
        scope,
        projectPath: scope === 'project' ? process.cwd() : undefined,
        presetNames: selected.values,
      });
      printStdout(renderJson(state));
    });

  presetCommand
    .command('create [name] [skills...]')
    .description('Create a preset with a non-empty list of skills.')
    .action(async (name: string | undefined, skills: string[] | undefined) => {
      const promptContext = { canPrompt: canPrompt(), prompt };
      const availableSkills = await withLoadedConfig((skillsDir) => listSkills(skillsDir));
      if ((!skills || skills.length === 0) && availableSkills.length === 0) {
        printStdout(renderMessage('No skills are available to create a preset.'));
        return;
      }

      const existingPresets = await listPresetDefinitions();
      let usedPrompt = false;

      let presetName = name?.trim() ?? '';
      if (presetName.length === 0) {
        ensurePromptable(promptContext, 'Preset name is required in non-interactive mode.', 'Run `skm preset create <name> <skill...>`.');
        usedPrompt = true;
        while (true) {
          const candidate = (await prompt.input('Preset name')).trim();
          if (candidate.length === 0) {
            continue;
          }
          if (existingPresets.some((preset) => preset.name === candidate)) {
            printStdout(renderMessage(`Preset ${candidate} already exists.`));
            continue;
          }
          presetName = candidate;
          break;
        }
      }

      const selectedSkills = await collectMany(
        promptContext,
        skills,
        createSkillChoices(availableSkills),
        'Select skills for the preset',
        'At least one skill is required in non-interactive mode.',
        'Run `skm preset create <name> <skill...>`.',
      );
      usedPrompt = usedPrompt || selectedSkills.usedPrompt;
      const normalizedSkills = stableUnique(selectedSkills.values);

      if (usedPrompt) {
        const confirmed = await prompt.confirm(`Create preset ${presetName} with skills [${normalizedSkills.join(', ')}]?`);
        if (!confirmed) {
          throw new PromptCancelledError();
        }
      }

      const created = await addPresetDefinition({ name: presetName, skills: normalizedSkills });
      printStdout(renderJson(created));
    });

  presetCommand
    .command('update [name] [skills...]')
    .description('Replace an existing preset definition with the provided full skill list.')
    .action(async (name: string | undefined, skills: string[] | undefined) => {
      const promptContext = { canPrompt: canPrompt(), prompt };
      const availableSkills = await withLoadedConfig((skillsDir) => listSkills(skillsDir));
      if ((!skills || skills.length === 0) && availableSkills.length === 0) {
        printStdout(renderMessage('No skills are available to update preset definitions.'));
        return;
      }

      const presets = await listStaticPresets();
      const presetDefinitions = Object.entries(presets).map(([presetName, presetSkills]) => ({
        name: presetName,
        skills: presetSkills,
        source: 'static' as const,
        readonly: false,
      }));
      if (!name && presetDefinitions.length === 0) {
        printStdout(renderMessage('No presets are available to update.'));
        return;
      }
      let usedPrompt = false;

      const collectedName = await collectSingle(
        promptContext,
        name,
        createPresetChoices(presetDefinitions),
        'Select a preset to update',
        'Preset name is required in non-interactive mode.',
        'Run `skm preset update <name> <skill...>`.',
      );
      usedPrompt = usedPrompt || collectedName.usedPrompt;

      const selectedSkills = await collectMany(
        promptContext,
        skills,
        createSkillChoices(availableSkills),
        'Select replacement skills for the preset',
        'At least one skill is required in non-interactive mode.',
        'Run `skm preset update <name> <skill...>`.',
        presets[collectedName.value] ?? [],
      );
      usedPrompt = usedPrompt || selectedSkills.usedPrompt;
      const normalizedSkills = stableUnique(selectedSkills.values);

      if (usedPrompt) {
        const confirmed = await prompt.confirm(`Update preset ${collectedName.value} with skills [${normalizedSkills.join(', ')}]?`);
        if (!confirmed) {
          throw new PromptCancelledError();
        }
      }

      const updated = await updatePresetDefinition({ name: collectedName.value, skills: normalizedSkills });
      printStdout(renderJson(updated));
    });

  presetCommand
    .command('rm [name]')
    .description('Remove a preset definition from global presets.yaml.')
    .action(async (name: string | undefined) => {
      const promptContext = { canPrompt: canPrompt(), prompt };
      const presets = await listStaticPresets();
      const presetDefinitions = Object.entries(presets).map(([presetName, presetSkills]) => ({
        name: presetName,
        skills: presetSkills,
        source: 'static' as const,
        readonly: false,
      }));
      if (!name && presetDefinitions.length === 0) {
        printStdout(renderMessage('No presets are available to remove.'));
        return;
      }
      const collected = await collectSingle(
        promptContext,
        name,
        createPresetChoices(presetDefinitions),
        'Select a preset to remove',
        'Preset name is required in non-interactive mode.',
        'Run `skm preset rm <name>`.',
      );
      const references = await findPresetReferences(collected.value);

      if (references.length > 0) {
        const warning = `Preset ${collected.value} is still referenced by ${references.length} project(s).`;
        if (collected.usedPrompt) {
          printStderr(renderMessage(`Warning: ${warning}`));
          const confirmedReferenced = await prompt.confirm('Remove it anyway?');
          if (!confirmedReferenced) {
            throw new PromptCancelledError();
          }
        } else {
          printStderr(renderMessage(`Warning: ${warning}`));
        }
      }

      if (collected.usedPrompt) {
        const confirmed = await prompt.confirm(`Remove preset ${collected.value}?`);
        if (!confirmed) {
          throw new PromptCancelledError();
        }
      }

      await deletePresetDefinition(collected.value);
      printStdout(renderJson({ name: collected.value, referencedProjects: references.length, deleted: true }));
    });

  program
    .command('sync')
    .description('Reconcile target installations so they match the selected scope state.')
    .option('--global', 'Sync global scope instead of the current project.')
    .action(async (options: { global?: boolean }) => {
      const state = options.global ? await syncGlobal() : await syncProject(process.cwd());
      printStdout(renderJson(state));
    });

  program
    .command('doctor')
    .description('Inspect selected scope drift, missing sources, stale index, and missing preset definitions.')
    .option('--global', 'Inspect global scope instead of the current project.')
    .action(async (options: { global?: boolean }) => {
      const issues = options.global ? await doctorGlobal() : await doctorProject(process.cwd());
      printStdout(renderJson({ ok: issues.length === 0, issues }));
    });

  program
    .command('ui')
    .description('Start the local Web UI server.')
    .option('--port <port>', 'Preferred local port for the Web UI server.', parsePortOption)
    .option('--no-open', 'Do not auto-open the browser after startup.')
    .action(async (options: { port?: number; open?: boolean }) => {
      await uiRuntime.run({
        port: options.port,
        noOpen: options.open === false,
        stdout: printStdout,
        stderr: printStderr,
      });
    });

  return program;
}

export async function runCli(argv = process.argv, deps: CliDependencies = {}): Promise<number> {
  const program = createProgram(deps);

  try {
    await program.parseAsync(argv);
    return ExitCode.Success;
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      printStdout(renderMessage('Cancelled.'));
      return ExitCode.Success;
    }

    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed') {
        return ExitCode.Success;
      }

      const wrapped = new SkmError('usage', error.message);
      printStderr(renderMessage(formatError(wrapped)));
      return wrapped.exitCode;
    }

    printStderr(renderMessage(formatError(error)));
    if (error instanceof SkmError) {
      return error.exitCode;
    }

    return ExitCode.Runtime;
  }
}
