import type {
  Ec2InstanceSummary,
  LaunchShortcutResult,
  RecentLaunchRecord,
  SessionTabState,
  TunnelSessionState,
  TunnelShortcutPayload,
  TunnelTargetSummary
} from '../shared/contracts'
import type { AppProfileRecord } from './profile-store'
import type { QuickAccessStore, RecordRecentLaunchInput, SavedShortcutRecord } from './quick-access-store'

interface ExecutionContext {
  profile: Pick<AppProfileRecord, 'id' | 'name' | 'region'>
  awsCliPath: string
  env: Record<string, string>
}

interface QuickAccessLauncherOptions {
  quickAccessStore: Pick<QuickAccessStore, 'getSavedShortcut' | 'recordRecentLaunch'>
  getExecutionContext(profileId: string): Promise<ExecutionContext>
  listEc2Instances(profileId: string): Promise<Ec2InstanceSummary[]>
  listTunnelTargets(profileId: string, kind: TunnelShortcutPayload['targetKind']): Promise<TunnelTargetSummary[]>
  openSsmSession(input: {
    profileId: string
    profileName: string
    region: string
    instanceId: string
    instanceName: string
    cols: number
    rows: number
    awsCliPath: string
    env: Record<string, string>
  }): Promise<SessionTabState>
  openTunnelSession(input: {
    profileId: string
    profileName: string
    region: string
    jumpInstanceId: string
    jumpInstanceName: string
    targetName: string
    targetKind: TunnelShortcutPayload['targetKind']
    targetEndpoint: string
    remotePort: number
    localPort: number
    awsCliPath: string
    env: Record<string, string>
  }): Promise<TunnelSessionState>
  resolvePreferredTunnelPort(port: number): Promise<number>
}

export class QuickAccessLauncher {
  readonly #quickAccessStore: QuickAccessLauncherOptions['quickAccessStore']
  readonly #getExecutionContext: QuickAccessLauncherOptions['getExecutionContext']
  readonly #listEc2Instances: QuickAccessLauncherOptions['listEc2Instances']
  readonly #listTunnelTargets: QuickAccessLauncherOptions['listTunnelTargets']
  readonly #openSsmSession: QuickAccessLauncherOptions['openSsmSession']
  readonly #openTunnelSession: QuickAccessLauncherOptions['openTunnelSession']
  readonly #resolvePreferredTunnelPort: QuickAccessLauncherOptions['resolvePreferredTunnelPort']

  constructor(options: QuickAccessLauncherOptions) {
    this.#quickAccessStore = options.quickAccessStore
    this.#getExecutionContext = options.getExecutionContext
    this.#listEc2Instances = options.listEc2Instances
    this.#listTunnelTargets = options.listTunnelTargets
    this.#openSsmSession = options.openSsmSession
    this.#openTunnelSession = options.openTunnelSession
    this.#resolvePreferredTunnelPort = options.resolvePreferredTunnelPort
  }

  async launchShortcut(shortcutId: string, terminalSize: { cols: number; rows: number }): Promise<LaunchShortcutResult> {
    const shortcut = await this.#quickAccessStore.getSavedShortcut(shortcutId)

    if (!shortcut) {
      throw new Error(`Shortcut "${shortcutId}" was not found.`)
    }

    const context = await this.#getExecutionContext(shortcut.profileId)

    if (shortcut.launchKind === 'ssm') {
      const payload = shortcut.payload as SavedShortcutRecord['payload'] & { instanceId: string; instanceName: string }
      const instances = await this.#listEc2Instances(shortcut.profileId)
      const instance = instances.find((candidate) => candidate.id === payload.instanceId && candidate.state === 'running')

      if (!instance) {
        throw new Error(`Saved SSM target "${payload.instanceName}" is no longer available.`)
      }

      const session = await this.#openSsmSession({
        profileId: context.profile.id,
        profileName: context.profile.name,
        region: context.profile.region,
        instanceId: payload.instanceId,
        instanceName: payload.instanceName,
        cols: terminalSize.cols,
        rows: terminalSize.rows,
        awsCliPath: context.awsCliPath,
        env: context.env
      })

      await this.#recordRecent(shortcut)
      return { launchKind: 'ssm', session }
    }

    const payload = shortcut.payload as TunnelShortcutPayload
    const [jumpInstances, tunnelTargets] = await Promise.all([
      this.#listEc2Instances(shortcut.profileId),
      this.#listTunnelTargets(shortcut.profileId, payload.targetKind)
    ])

    const jumpInstance = jumpInstances.find((candidate) => candidate.id === payload.jumpInstanceId && candidate.state === 'running')
    const target = tunnelTargets.find((candidate) => candidate.id === payload.targetId)

    if (!jumpInstance || !target) {
      throw new Error(`Saved tunnel target "${payload.targetName}" is no longer available.`)
    }

    const localPort = await this.#resolvePreferredTunnelPort(payload.preferredLocalPort)
    const session = await this.#openTunnelSession({
      profileId: context.profile.id,
      profileName: context.profile.name,
      region: context.profile.region,
      jumpInstanceId: payload.jumpInstanceId,
      jumpInstanceName: payload.jumpInstanceName,
      targetName: payload.targetName,
      targetKind: payload.targetKind,
      targetEndpoint: payload.targetEndpoint,
      remotePort: payload.remotePort,
      localPort,
      awsCliPath: context.awsCliPath,
      env: context.env
    })

    await this.#recordRecent(shortcut)
    return { launchKind: 'tunnel', session }
  }

  async #recordRecent(shortcut: SavedShortcutRecord | RecentLaunchRecord): Promise<void> {
    const recent: RecordRecentLaunchInput = {
      label: shortcut.label,
      profileId: shortcut.profileId,
      profileName: shortcut.profileName,
      region: shortcut.region,
      launchKind: shortcut.launchKind,
      payload: shortcut.payload
    }

    await this.#quickAccessStore.recordRecentLaunch(recent)
  }
}
