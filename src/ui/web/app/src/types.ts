export interface ApiErrorDetail {
  kind: string;
  message: string;
  details?: string;
  hint?: string;
  fieldErrors?: Record<string, string>;
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

export interface QuickActionView {
  id: string;
  label: string;
  command: string;
  loadingLabel?: string;
  tone?: 'primary' | 'secondary' | 'ghost';
}

export interface ProjectReferenceView {
  projectId: string;
  projectPath: string;
  displayName: string;
}

export interface ProjectSummaryView extends ProjectReferenceView {
  targets: string[];
  enabledSkillCount: number;
  enabledPresetCount: number;
  updatedAt: string;
}

export interface MatchedProjectView extends ProjectSummaryView {
  matched: true;
}

export interface BootView {
  initialRoute: string;
  launchCwd: string;
  matchedProjectId: string | null;
  matchedProjectName: string | null;
  launchStatus: LaunchStatusView;
}

export interface ScopeSummaryView {
  kind: 'project' | 'global';
  label: string;
  description: string;
}

export interface RecommendedActionView {
  id: string;
  label: string;
  description: string;
  to: string;
  emphasis: 'primary' | 'secondary';
}

export interface RelationshipSummaryItemView {
  id: string;
  sentence: string;
  emphasis?: string;
}

export interface RelationshipSummaryView {
  heading: string;
  items: RelationshipSummaryItemView[];
}

export interface FolderPickView {
  path: string | null;
  canceled: boolean;
}

export interface OverviewView {
  launchCwd: string;
  matchedProject: MatchedProjectView | null;
  primaryScope: ScopeSummaryView;
  recommendedActions: RecommendedActionView[];
  relationshipSummary: RelationshipSummaryView;
  totals: {
    projects: number;
    presets: number;
    skills: number;
    globalEnabledSkills: number;
    globalEnabledPresets: number;
  };
  recentProjects: ProjectSummaryView[];
}

export interface EnabledPresetView {
  name: string;
  skills: string[];
  source: 'static' | 'dynamic';
  readonly: boolean;
}

export interface ResolvedSkillSourceView {
  kind: 'direct' | 'preset';
  label: string;
  presetName?: string;
}

export interface ResolvedSkillView {
  name: string;
  sourceLabels: string[];
  direct: boolean;
  viaPresets: string[];
  sources: ResolvedSkillSourceView[];
}

export interface ProjectPresetControlView {
  name: string;
  skills: string[];
  source: 'static' | 'dynamic';
  readonly: boolean;
  enabled: boolean;
  editable: boolean;
  reason?: string;
}

export interface ProjectSkillControlView {
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  editable: boolean;
  direct: boolean;
  viaPresets: string[];
  reason?: string;
}

export interface ProjectDetailView extends ProjectReferenceView {
  targets: string[];
  updatedAt: string;
  enabledPresets: EnabledPresetView[];
  enabledSkills: string[];
  presetControls: {
    enabled: ProjectPresetControlView[];
    available: ProjectPresetControlView[];
  };
  skillControls: {
    enabled: ProjectSkillControlView[];
    available: ProjectSkillControlView[];
  };
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

export interface SkillIntersectionProjectView extends ProjectReferenceView {
  viaPresetNames?: string[];
}

export interface SkillItemView {
  name: string;
  description: string;
  path: string;
  displayPath: string;
  fullPath: string;
  openPath: string;
  locationKind: 'direct' | 'dynamic-preset';
  globalEnabled: boolean;
  updatedAt?: string;
  directProjects: SkillIntersectionProjectView[];
  viaPresetProjects: SkillIntersectionProjectView[];
}

export interface SkillsView {
  items: SkillItemView[];
}

export interface PresetDeletePreviewView {
  name: string;
  referenceCount: number;
  source: 'static' | 'dynamic';
  readonly: boolean;
  referenceProjects: ProjectReferenceView[];
}

export interface PresetSkillMembershipView {
  name: string;
  description: string;
  path: string;
  included: boolean;
  editable: boolean;
  reason?: string;
}

export interface PresetDetailView {
  name: string;
  source: 'static' | 'dynamic';
  readonly: boolean;
  skillCount: number;
  referenceCount: number;
  includedSkills: string[];
  availableSkills: PresetSkillMembershipView[];
  affectedProjects: ProjectReferenceView[];
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
  folderPicker: {
    supported: boolean;
    mode: 'host' | 'manual-only';
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

export interface WorkspaceSpineView {
  scopeLabel: string;
  scopeDescription?: string;
  targets?: string[];
}
