import type { AppReadinessState, AppProfileSummary, DependencyStatus, RuntimeConfigState } from '../shared/contracts'

export function buildAppReadinessState(input: {
  dependencyStatus: DependencyStatus
  profiles: AppProfileSummary[]
  runtimeConfig: RuntimeConfigState
  appSettings: AppReadinessState['appSettings']
  canImportLegacyProfiles: boolean
  keychainAccessNoticeAcceptedAt: string | null
}): AppReadinessState {
  return {
    dependencyStatus: input.dependencyStatus,
    profiles: input.profiles,
    runtimeConfig: input.runtimeConfig,
    appSettings: input.appSettings,
    needsProfileSetup: input.profiles.length === 0,
    needsDependencySetup:
      !input.dependencyStatus.awsCli.installed || !input.dependencyStatus.sessionManagerPlugin.installed,
    canImportLegacyProfiles: input.profiles.length === 0 && input.canImportLegacyProfiles,
    needsKeychainAccessNotice: input.profiles.length > 0 && input.keychainAccessNoticeAcceptedAt === null
  }
}
