import type { AppReadinessState, AppProfileSummary, DependencyStatus, RuntimeConfigState } from '../shared/contracts'

export function buildAppReadinessState(input: {
  dependencyStatus: DependencyStatus
  profiles: AppProfileSummary[]
  activeProfile: AppProfileSummary | null
  runtimeConfig: RuntimeConfigState
  canImportLegacyProfiles: boolean
  keychainAccessNoticeAcceptedAt: string | null
}): AppReadinessState {
  return {
    dependencyStatus: input.dependencyStatus,
    profiles: input.profiles,
    activeProfile: input.activeProfile,
    runtimeConfig: input.runtimeConfig,
    needsProfileSetup: input.profiles.length === 0,
    needsDependencySetup:
      !input.dependencyStatus.awsCli.installed || !input.dependencyStatus.sessionManagerPlugin.installed,
    canImportLegacyProfiles: input.profiles.length === 0 && input.canImportLegacyProfiles,
    needsKeychainAccessNotice: input.activeProfile !== null && input.keychainAccessNoticeAcceptedAt === null
  }
}
