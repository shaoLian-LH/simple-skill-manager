export {
  backupChangedManagedPaths,
  commitInstallChanges,
  preflightInstallConflicts,
  restoreInstallChanges,
  type ManagedInstallBatchOptions,
  type PendingInstallChange,
} from './changeset.js';
export { applyManagedInstalls } from './apply.js';
export {
  ensureManagedInstall,
  generatedInstallMatches,
  type InstallResult,
  type ManagedInstallContext,
} from './ensure.js';
export {
  getGeneratedContentOrThrow,
  resolveManagedInstallPlan,
  type ManagedInstallKind,
  type ManagedInstallPlan,
  type ManagedInstallPlanResolver,
  type ManagedInstallPlanResolverInput,
} from './plan.js';
export { removeManagedInstall, type RemoveManagedInstallOptions } from './remove.js';
