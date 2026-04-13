import Table from 'cli-table3';

import type { ActivationScope, ActivationState, Config, DoctorIssue, DoctorIssueType, PresetSource } from '../types.js';
import { toDisplayPath } from '../utils/path.js';

export interface ConfigInitOutput {
  appDir: string;
  created: string[];
  skipped: string[];
}

export interface SkillListOutputItem {
  name: string;
  path: string;
  description: string;
}

export interface SkillInspectOutput {
  name: string;
  description: string;
  dirPath: string;
  skillFilePath: string;
  frontmatter: Record<string, unknown>;
  bodyPreview: string;
}

export interface PresetInspectOutput {
  name: string;
  skills: string[];
  source: PresetSource;
  readonly: boolean;
}

export interface PresetListOutputItem {
  name: string;
  skillCount: number;
  source: PresetSource;
  readonly: boolean;
}

export interface PresetMutationOutput {
  name: string;
  skills?: string[];
  referencedProjects?: number;
  deleted?: boolean;
}

export interface DoctorOutput {
  ok: boolean;
  issues: DoctorIssue[];
}

export interface RenderOptions {
  json?: boolean;
}

const DOCTOR_ISSUE_LABELS: Record<DoctorIssueType, string> = {
  'missing-source': 'Missing source',
  'missing-installation': 'Missing installation',
  'unexpected-target-entry': 'Unexpected target entry',
  'broken-link': 'Broken installation',
  'copied-skill-may-have-drifted': 'Copied skill may have drifted',
  'stale-global-index': 'Stale global index',
  'missing-preset-definition': 'Missing preset definition',
};

export function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderMessage(message: string): string {
  return `${message}\n`;
}

export function renderStructuredOutput<T>(value: T, text: string, options: RenderOptions = {}): string {
  return options.json ? renderJson(value) : renderMessage(text);
}

export function renderConfigInitText(result: ConfigInitOutput): string {
  return [
    'Initialized global configuration',
    `App directory: ${toDisplayPath(result.appDir)}`,
    ...formatSection('Created', result.created),
    ...formatSection('Skipped', result.skipped),
  ].join('\n');
}

export function renderConfigSummaryText(config: Config & { appDir?: string }, title: string): string {
  return [
    title,
    ...(config.appDir ? [`App directory: ${toDisplayPath(config.appDir)}`] : []),
    `Skills directory: ${toDisplayPath(config.skillsDir)}`,
    `Default targets: ${formatInlineList(config.defaultTargets)}`,
  ].join('\n');
}

export function renderSkillListText(skills: SkillListOutputItem[]): string {
  return renderListTable({
    title: `Skills (${skills.length})`,
    emptyMessage: 'No skills found.',
    head: ['Name', 'Description'],
    colWidths: [34, 72],
    rows: skills.map((skill) => [skill.name, skill.description || '—']),
  });
}

export function renderSkillInspectText(skill: SkillInspectOutput): string {
  return [
    `Skill: ${skill.name}`,
    `Description: ${skill.description || 'none'}`,
    `Directory: ${toDisplayPath(skill.dirPath)}`,
    `File: ${toDisplayPath(skill.skillFilePath)}`,
    '',
    'Frontmatter:',
    ...formatKeyValueList(skill.frontmatter),
    '',
    'Preview:',
    ...(skill.bodyPreview.trim().length > 0 ? skill.bodyPreview.trim().split('\n') : ['(empty)']),
  ].join('\n');
}

export function renderPresetListText(presets: PresetListOutputItem[]): string {
  return renderListTable({
    title: `Presets (${presets.length})`,
    emptyMessage: 'No presets found.',
    head: ['Name', 'Skills', 'Source', 'Access'],
    colWidths: [34, 12, 12, 14],
    rows: presets.map((preset) => [
      preset.name,
      String(preset.skillCount),
      preset.source,
      preset.readonly ? 'read-only' : 'editable',
    ]),
  });
}

export function renderPresetInspectText(preset: PresetInspectOutput): string {
  return [
    `Preset: ${preset.name}`,
    `Source: ${preset.source}`,
    `Read-only: ${preset.readonly ? 'yes' : 'no'}`,
    ...formatSection('Skills', preset.skills),
  ].join('\n');
}

export function renderPresetMutationText(result: PresetMutationOutput, title: string): string {
  return [
    title,
    `Name: ${result.name}`,
    ...(result.skills ? [`Skills: ${formatInlineList(result.skills)}`] : []),
    ...(typeof result.referencedProjects === 'number' ? [`Referenced projects: ${result.referencedProjects}`] : []),
    ...(typeof result.deleted === 'boolean' ? [`Deleted: ${result.deleted ? 'yes' : 'no'}`] : []),
  ].join('\n');
}

/**
 * Keep activation output at the state-summary level so toggles stay readable
 * even when the managed target metadata becomes deeper over time.
 */
export function renderActivationText(input: {
  title: string;
  scope: ActivationScope;
  selectionLabel?: string;
  selectedNames?: string[];
  state: ActivationState;
}): string {
  const installedSkills = collectInstalledSkillNames(input.state);

  return [
    input.title,
    `Scope: ${input.scope}`,
    ...(input.selectionLabel && input.selectedNames
      ? [`${input.selectionLabel}: ${formatInlineList(input.selectedNames)}`]
      : []),
    `Enabled skills: ${formatInlineList(input.state.enabledSkills)}`,
    `Enabled presets: ${formatInlineList(input.state.enabledPresets)}`,
    `Installed skills: ${formatInlineList(installedSkills)}`,
    ...formatSection('Targets', formatTargetRows(input.state)),
  ].join('\n');
}

export function renderDoctorText(scope: ActivationScope, report: DoctorOutput): string {
  if (report.ok) {
    return [`Doctor check passed`, `Scope: ${scope}`, 'Issues: none'].join('\n');
  }

  const groupedIssues = groupDoctorIssues(report.issues);
  const lines = [`Doctor found ${formatCount(report.issues.length, 'issue')}`, `Scope: ${scope}`];

  for (const [issueType, issues] of groupedIssues) {
    lines.push('');
    lines.push(`${DOCTOR_ISSUE_LABELS[issueType]} (${issues.length})`);
    lines.push(...issues.map((issue) => `- ${normalizeDoctorMessage(issue)}`));
  }

  return lines.join('\n');
}

function formatSection(title: string, values: string[]): string[] {
  if (values.length === 0) {
    return [`${title}: none`];
  }

  return [`${title}:`, ...values.map((value) => `- ${value}`)];
}

function formatInlineList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function renderListTable(input: {
  title: string;
  emptyMessage: string;
  head: string[];
  rows: string[][];
  colWidths: number[];
}): string {
  if (input.rows.length === 0) {
    return [input.title, input.emptyMessage].join('\n');
  }

  const table = new Table({
    head: input.head,
    colWidths: input.colWidths,
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: {
      head: [],
      border: [],
      compact: false,
      'padding-left': 1,
      'padding-right': 1,
    },
  });
  table.push(...input.rows);

  return [input.title, table.toString()].join('\n');
}

function formatKeyValueList(values: Record<string, unknown>): string[] {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return ['(none)'];
  }

  return entries.map(([key, value]) => `- ${key}: ${formatUnknownValue(value)}`);
}

function formatUnknownValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function collectInstalledSkillNames(state: ActivationState): string[] {
  return [...new Set(Object.values(state.targets).flatMap((targetState) => Object.keys(targetState?.skills ?? {})))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function formatTargetRows(state: ActivationState): string[] {
  const entries = Object.entries(state.targets).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return [];
  }

  return entries.map(([target, targetState]) => {
    const skillNames = Object.keys(targetState?.skills ?? {}).sort((left, right) => left.localeCompare(right));
    return `${target} (${formatCount(skillNames.length, 'skill')}): ${formatInlineList(skillNames)}`;
  });
}

function groupDoctorIssues(issues: DoctorIssue[]): Array<[DoctorIssueType, DoctorIssue[]]> {
  const grouped = new Map<DoctorIssueType, DoctorIssue[]>();

  for (const issue of issues) {
    const bucket = grouped.get(issue.type) ?? [];
    bucket.push(issue);
    grouped.set(issue.type, bucket);
  }

  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function normalizeDoctorMessage(issue: DoctorIssue): string {
  let message = issue.message;
  if (issue.path) {
    message = message.replaceAll(issue.path, toDisplayPath(issue.path));
  }
  if (issue.expectedPath) {
    message = message.replaceAll(issue.expectedPath, toDisplayPath(issue.expectedPath));
  }
  return message;
}
