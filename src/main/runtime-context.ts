import type { DependencyStatus } from './dependencies'
import type { ActiveProfileWithCredentials, AppProfileRecord } from './profile-store'

export interface ExecutionContext {
  profile: AppProfileRecord
  awsCliPath: string
  sessionManagerPluginPath: string
  env: Record<string, string>
}

export function buildExecutionContext(
  activeProfile: ActiveProfileWithCredentials,
  dependencyStatus: DependencyStatus
): ExecutionContext {
  if (!dependencyStatus.awsCli.installed || !dependencyStatus.awsCli.resolvedPath) {
    throw new Error(dependencyStatus.awsCli.error ?? 'Unable to locate aws CLI.')
  }

  if (!dependencyStatus.sessionManagerPlugin.installed || !dependencyStatus.sessionManagerPlugin.resolvedPath) {
    throw new Error(dependencyStatus.sessionManagerPlugin.error ?? 'Unable to locate session-manager-plugin.')
  }

  return {
    profile: activeProfile.profile,
    awsCliPath: dependencyStatus.awsCli.resolvedPath,
    sessionManagerPluginPath: dependencyStatus.sessionManagerPlugin.resolvedPath,
    env: {
      AWS_ACCESS_KEY_ID: activeProfile.credentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: activeProfile.credentials.secretAccessKey,
      ...(activeProfile.credentials.sessionToken
        ? { AWS_SESSION_TOKEN: activeProfile.credentials.sessionToken }
        : {}),
      AWS_REGION: activeProfile.profile.region,
      AWS_DEFAULT_REGION: activeProfile.profile.region
    }
  }
}
