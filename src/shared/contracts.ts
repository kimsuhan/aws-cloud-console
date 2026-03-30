export type ActionId = 'ec2-ssm-connect' | 'aws-tunneling'

export interface DependencyStatus {
  awsCliInstalled: boolean
  sessionManagerPluginInstalled: boolean
}

export interface ProfileSummary {
  name: string
}

export interface ActiveProfileState {
  profileName: string
  region: string
}

export interface AppReadinessState {
  dependencyStatus: DependencyStatus
  profiles: ProfileSummary[]
  activeProfile: ActiveProfileState | null
}

export interface Ec2InstanceSummary {
  id: string
  name: string
  state: string
  privateIpAddress: string | null
  availabilityZone: string | null
}

export type SessionStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface SessionTabState {
  id: string
  title: string
  instanceId: string
  instanceName: string
  profileName: string
  region: string
  status: SessionStatus
  openedAt: number
}

export interface SessionOutputEvent {
  sessionId: string
  stream: 'stdout' | 'stderr'
  data: string
}

export interface SessionExitEvent {
  sessionId: string
  code: number | null
}

export interface SessionErrorEvent {
  sessionId: string
  message: string
}

export interface OpenSessionRequest {
  instanceId: string
  instanceName: string
}

export interface SessionResizeRequest {
  sessionId: string
  cols: number
  rows: number
}

export type TunnelKind = 'db' | 'redis'

export interface TunnelTargetSummary {
  id: string
  kind: TunnelKind
  name: string
  engine: string
  endpoint: string
  remotePort: number
  source: string
}

export type TunnelStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'

export interface TunnelSessionState {
  id: string
  targetName: string
  targetKind: TunnelKind
  targetEndpoint: string
  remotePort: number
  localPort: number
  jumpInstanceId: string
  jumpInstanceName: string
  profileName: string
  region: string
  status: TunnelStatus
  openedAt: number
}

export interface OpenTunnelSessionRequest {
  targetName: string
  targetKind: TunnelKind
  targetEndpoint: string
  remotePort: number
  localPort: number
  jumpInstanceId: string
  jumpInstanceName: string
}

export interface TunnelLogEvent {
  sessionId: string
  data: string
}

export interface TunnelExitEvent {
  sessionId: string
  code: number | null
}

export interface TunnelErrorEvent {
  sessionId: string
  message: string
}

export interface ElectronApi {
  getAppReadiness: () => Promise<AppReadinessState>
  listAwsProfiles: () => Promise<ProfileSummary[]>
  selectAwsProfile: (profileName: string) => Promise<ActiveProfileState>
  setActiveRegion: (region: string) => Promise<ActiveProfileState>
  resetActiveProfile: () => Promise<void>
  listEc2Instances: () => Promise<Ec2InstanceSummary[]>
  listTunnelTargets: (kind: TunnelKind) => Promise<TunnelTargetSummary[]>
  openTunnelSession: (request: OpenTunnelSessionRequest) => Promise<TunnelSessionState>
  closeTunnelSession: (sessionId: string) => Promise<void>
  openSsmSession: (request: OpenSessionRequest) => Promise<SessionTabState>
  sendSessionInput: (sessionId: string, data: string) => Promise<void>
  resizeSession: (request: SessionResizeRequest) => Promise<void>
  closeSession: (sessionId: string) => Promise<void>
  onSessionOutput: (listener: (event: SessionOutputEvent) => void) => () => void
  onSessionExit: (listener: (event: SessionExitEvent) => void) => () => void
  onSessionError: (listener: (event: SessionErrorEvent) => void) => () => void
  onTunnelLog: (listener: (event: TunnelLogEvent) => void) => () => void
  onTunnelExit: (listener: (event: TunnelExitEvent) => void) => () => void
  onTunnelError: (listener: (event: TunnelErrorEvent) => void) => () => void
}
