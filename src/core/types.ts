export const SUPPORTED_TARGETS = ['.agents', '.trae'] as const;
export type TargetName = (typeof SUPPORTED_TARGETS)[number];

export const INSTALL_MODES = ['symlink', 'copy'] as const;
export type InstallMode = (typeof INSTALL_MODES)[number];

export type ErrorKind = 'usage' | 'config' | 'conflict' | 'runtime';

export interface Config {
  version: 1;
  skillsDir: string;
  defaultTargets: TargetName[];
}

export interface SkillDefinition {
  name: string;
  description: string;
  dirPath: string;
  skillFilePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export type PresetsMap = Record<string, string[]>;

export interface InstalledSkillRecord {
  sourcePath: string;
  installMode: InstallMode;
  installedAt: string;
}

export interface TargetState {
  skills: Record<string, InstalledSkillRecord>;
}

export interface ProjectState {
  version: 1;
  projectPath: string;
  targets: Partial<Record<TargetName, TargetState>>;
  enabledSkills: string[];
  enabledPresets: string[];
  updatedAt: string;
}

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
