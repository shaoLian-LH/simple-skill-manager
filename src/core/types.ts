export const TARGET_REGISTRY = {
  '.agents': {
    name: '.agents',
    projectRootDir: '.agents',
    globalRootDir: '.agents',
    installKind: 'skill-dir',
    localInstallBase: 'skills',
    globalInstallBase: 'skills',
  },
  '.trae': {
    name: '.trae',
    projectRootDir: '.trae',
    globalRootDir: '.trae',
    installKind: 'skill-dir',
    localInstallBase: 'skills',
    globalInstallBase: 'skills',
  },
  '.kiro': {
    name: '.kiro',
    projectRootDir: '.kiro',
    globalRootDir: '.kiro',
    installKind: 'skill-dir',
    localInstallBase: 'skills',
    globalInstallBase: 'skills',
  },
  '.claude': {
    name: '.claude',
    projectRootDir: '.claude',
    globalRootDir: '.claude',
    installKind: 'skill-dir',
    localInstallBase: 'skills',
    globalInstallBase: 'skills',
  },
  '.gemini': {
    name: '.gemini',
    projectRootDir: '.gemini',
    globalRootDir: '.gemini',
    installKind: 'gemini-command',
    localInstallBase: 'commands',
    globalInstallBase: 'commands',
  },
} as const;

export type TargetName = keyof typeof TARGET_REGISTRY;
export type TargetInstallKind = (typeof TARGET_REGISTRY)[TargetName]['installKind'];
export type ActivationScope = 'project' | 'global';
export type TargetSpec = (typeof TARGET_REGISTRY)[TargetName];
export const SUPPORTED_TARGETS = Object.keys(TARGET_REGISTRY) as TargetName[];

export const INSTALL_MODES = ['symlink', 'copy', 'generated'] as const;
export type InstallMode = (typeof INSTALL_MODES)[number];
export const PRESET_SOURCES = ['static', 'dynamic'] as const;
export type PresetSource = (typeof PRESET_SOURCES)[number];

export type ErrorKind = 'usage' | 'config' | 'conflict' | 'runtime';

export interface Config {
  version: 1;
  skillsDir: string;
  defaultTargets: TargetName[];
}

export interface SkillDefinition {
  name: string;
  localName: string;
  scopeName: string | null;
  description: string;
  dirPath: string;
  skillFilePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export type PresetsMap = Record<string, string[]>;

export interface PresetDefinition {
  name: string;
  skills: string[];
  source: PresetSource;
  readonly: boolean;
}

export interface InstalledSkillRecord {
  sourcePath: string;
  installMode: InstallMode;
  installedAt: string;
}

export interface TargetState {
  skills: Record<string, InstalledSkillRecord>;
}

export interface ActivationState {
  version: 1;
  targets: Partial<Record<TargetName, TargetState>>;
  enabledSkills: string[];
  enabledPresets: string[];
  updatedAt: string;
}

export interface ProjectState extends ActivationState {
  projectPath: string;
}

export interface GlobalState extends ActivationState {}

export type ScopedState = ProjectState | GlobalState;

export interface ProjectIndexEntry {
  targets: TargetName[];
  enabledSkills: string[];
  enabledPresets: string[];
  updatedAt: string;
}

export interface ProjectsIndex {
  version: 1;
  projects: Record<string, ProjectIndexEntry>;
}

export type DoctorIssueType =
  | 'missing-source'
  | 'missing-installation'
  | 'unexpected-target-entry'
  | 'broken-link'
  | 'copied-skill-may-have-drifted'
  | 'stale-global-index'
  | 'missing-preset-definition';

export interface DoctorIssue {
  type: DoctorIssueType;
  message: string;
  target?: TargetName;
  skillName?: string;
  presetName?: string;
  path?: string;
  expectedPath?: string;
}
