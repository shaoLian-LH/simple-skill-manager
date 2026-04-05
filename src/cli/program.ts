import { Command, CommanderError } from 'commander';

import {
  doctorProject,
  disablePreset,
  disableSkill,
  enablePreset,
  enableSkill,
  syncProject,
} from '../core/activation/service.js';
import { ExitCode, SkmError, formatError } from '../core/errors.js';
import { loadConfig, initGlobalConfig, setSkillsDir } from '../core/config/service.js';
import { getPresetByName, listPresets } from '../core/registry/presets.js';
import { getSkillByName, listSkills, toSkillInspectView } from '../core/registry/skills.js';
import { renderJson, renderMessage } from '../core/output/render.js';
import { toDisplayPath } from '../core/utils/path.js';

function printStdout(payload: string): void {
  process.stdout.write(payload);
}

function collectTargets(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function withLoadedConfig<T>(callback: (skillsDir: string) => Promise<T>): Promise<T> {
  const { config } = await loadConfig();
  return callback(config.skillsDir);
}

function createProgram(): Command {
  const program = new Command();

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

  const skillCommand = program.command('skill').description('Inspect globally available skills.');

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
    .command('inspect <name>')
    .description('Show the source path, frontmatter, and preview for a skill.')
    .action(async (name: string) => {
      const skill = await withLoadedConfig((skillsDir) => getSkillByName(skillsDir, name));
      printStdout(renderJson(toSkillInspectView(skill)));
    });

  const presetCommand = program.command('preset').description('Inspect globally configured skill presets.');

  presetCommand
    .command('list')
    .description('List all configured presets.')
    .action(async () => {
      const presets = await listPresets();
      printStdout(
        renderJson(
          Object.entries(presets)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, skills]) => ({ name, skillCount: skills.length })),
        ),
      );
    });

  presetCommand
    .command('inspect <name>')
    .description('Expand and print the skills in a preset.')
    .action(async (name: string) => {
      const skills = await getPresetByName(name);
      printStdout(renderJson({ name, skills }));
    });

  const enableCommand = program.command('enable').description('Enable a skill or preset in the current project.');

  enableCommand
    .command('skill <name>')
    .description('Enable a skill in the current project and install it into the selected targets.')
    .option('-t, --target <target>', 'Target root to install into. Repeat to install into multiple targets.', collectTargets, [])
    .action(async (name: string, options: { target: string[] }) => {
      const state = await enableSkill(process.cwd(), name, options.target);
      printStdout(renderJson(state));
    });

  enableCommand
    .command('preset <name>')
    .description('Enable a preset in the current project and install its skills into the selected targets.')
    .option('-t, --target <target>', 'Target root to install into. Repeat to install into multiple targets.', collectTargets, [])
    .action(async (name: string, options: { target: string[] }) => {
      const state = await enablePreset(process.cwd(), name, options.target);
      printStdout(renderJson(state));
    });

  const disableCommand = program.command('disable').description('Disable a skill or preset in the current project.');

  disableCommand
    .command('skill <name>')
    .description('Disable a skill in the current project.')
    .action(async (name: string) => {
      const state = await disableSkill(process.cwd(), name);
      printStdout(renderJson(state));
    });

  disableCommand
    .command('preset <name>')
    .description('Disable a preset in the current project.')
    .action(async (name: string) => {
      const state = await disablePreset(process.cwd(), name);
      printStdout(renderJson(state));
    });

  program
    .command('sync')
    .description('Reconcile target installations so they match `.skm/state.json`.')
    .action(async () => {
      const state = await syncProject(process.cwd());
      printStdout(renderJson(state));
    });

  program
    .command('doctor')
    .description('Inspect project state drift, missing sources, and stale global index entries.')
    .action(async () => {
      const issues = await doctorProject(process.cwd());
      printStdout(renderJson({ ok: issues.length === 0, issues }));
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<number> {
  const program = createProgram();

  try {
    await program.parseAsync(argv);
    return ExitCode.Success;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed') {
        return ExitCode.Success;
      }

      const wrapped = new SkmError('usage', error.message);
      process.stderr.write(renderMessage(formatError(wrapped)));
      return wrapped.exitCode;
    }

    process.stderr.write(renderMessage(formatError(error)));
    if (error instanceof SkmError) {
      return error.exitCode;
    }

    return ExitCode.Runtime;
  }
}
