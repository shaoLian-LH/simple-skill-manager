export interface ApiErrorDetail {
  kind: string;
  message: string;
  details?: string;
  hint?: string;
  fieldErrors?: Record<string, string>;
}

export interface QuickActionView {
  id: string;
  label: string;
  command: string;
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

export interface ProjectSummaryView {
  projectId: string;
  projectPath: string;
  targets: string[];
  enabledSkillCount: number;
  enabledPresetCount: number;
  updatedAt: string;
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

export interface EnabledPresetView {
  name: string;
  skills: string[];
  source: 'static' | 'dynamic';
  readonly: boolean;
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
  targets: string[];
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
  source: 'static' | 'dynamic';
  readonly: boolean;
}

export interface PresetsView {
  items: PresetView[];
  quickActions: QuickActionView[];
}

export interface PresetDeletePreviewView {
  name: string;
  referenceCount: number;
  source: 'static' | 'dynamic';
  readonly: boolean;
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

export interface ConfigView {
  skillsDir: string;
  defaultTargets: string[];
  supportedTargets: string[];
  quickActions: QuickActionView[];
  paths: {
    configFile: string;
    presetsFile: string;
    projectsFile: string;
  };
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
