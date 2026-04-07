import type { ErrorKind, TargetName } from '../../core/types.js';

export interface ApiSuccessEnvelope<T> {
  ok: true;
  data: T;
}

export interface ApiErrorDetail {
  kind: ErrorKind;
  message: string;
  details?: string;
  hint?: string;
  fieldErrors?: Record<string, string>;
}

export interface ApiErrorEnvelope {
  ok: false;
  error: ApiErrorDetail;
}

export interface LaunchStatusView {
  host: string;
  requestedPort: number;
  port: number;
  usedPortFallback: boolean;
  url: string;
  browserAttempted: boolean;
  browserOpened: boolean;
  browserError?: string;
}

export interface BootView {
  initialRoute: string;
  launchCwd: string;
  matchedProjectId: string | null;
  launchStatus: LaunchStatusView;
}

export interface QuickActionView {
  id: string;
  label: string;
  command: string;
}

export interface DashboardView {
  totals: {
    projects: number;
    presets: number;
    skills: number;
  };
  recentProjects: ProjectSummaryView[];
  quickActions: QuickActionView[];
}

export interface ConfigView {
  skillsDir: string;
  defaultTargets: TargetName[];
  supportedTargets: TargetName[];
  quickActions: QuickActionView[];
  paths: {
    configFile: string;
    presetsFile: string;
    projectsFile: string;
  };
}

export interface ProjectSummaryView {
  projectId: string;
  projectPath: string;
  targets: TargetName[];
  enabledSkillCount: number;
  enabledPresetCount: number;
  updatedAt: string;
}

export interface EnabledPresetView {
  name: string;
  skills: string[];
}

export interface ResolvedSkillView {
  name: string;
  sourceLabels: string[];
  direct: boolean;
  viaPresets: string[];
}

export interface ProjectDetailView {
  projectId: string;
  projectPath: string;
  targets: TargetName[];
  updatedAt: string;
  enabledPresets: EnabledPresetView[];
  enabledSkills: string[];
  resolvedSkills: ResolvedSkillView[];
  quickActions: QuickActionView[];
}

export interface PresetView {
  name: string;
  skills: string[];
  skillCount: number;
  referenceCount: number;
  referenceProjectIds: string[];
}

export interface PresetsView {
  items: PresetView[];
  quickActions: QuickActionView[];
}

export interface PresetDeletePreviewView {
  name: string;
  referenceCount: number;
  referenceProjects: Array<{
    projectId: string;
    projectPath: string;
  }>;
}

export interface SkillsView {
  items: Array<{
    name: string;
    description: string;
    path: string;
  }>;
}

export interface PresetDeleteView {
  deleted: {
    name: string;
    referenceCount: number;
    referenceProjectIds: string[];
  };
  presets: PresetsView;
}

export interface QuickOpenView {
  success: boolean;
  strategy: 'code' | 'default' | null;
  message: string;
}
