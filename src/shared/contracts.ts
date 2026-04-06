export type ActionId = 'ec2-ssm-connect' | 'aws-tunneling' | 's3-browser'

export type DependencySource = 'configured' | 'well-known' | 'path' | 'missing'

export interface ResolvedDependencyStatus {
  installed: boolean
  resolvedPath: string | null
  source: DependencySource
  error: string | null
}

export interface DependencyStatus {
  awsCli: ResolvedDependencyStatus
  sessionManagerPlugin: ResolvedDependencyStatus
}

export interface AppProfileSummary {
  id: string
  name: string
  region: string
  createdAt: string
  updatedAt: string
  hasSessionToken: boolean
  isDefault: boolean
}

export interface CreateProfileRequest {
  name: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface UpdateProfileRequest {
  id: string
  name: string
  region: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
}

export interface RuntimeConfigState {
  awsCliPath: string | null
  sessionManagerPluginPath: string | null
}

export type AppLanguage = 'ko' | 'en'
export type AppTheme = 'system' | 'light' | 'dark'
export const appUiScaleValues = ['system', '90', '100', '110', '120'] as const
export type AppUiScale = (typeof appUiScaleValues)[number]

export interface AppSettingsState {
  language: AppLanguage | null
  theme: AppTheme | null
  uiScale: AppUiScale | null
  selectedProfileId: string | null
}

export interface UpdateRuntimePathsRequest {
  awsCliPath: string | null
  sessionManagerPluginPath: string | null
}

export interface UpdateAppSettingsRequest {
  language?: AppLanguage | null
  theme?: AppTheme | null
  uiScale?: AppUiScale | null
  selectedProfileId?: string | null
}

export interface LegacyImportResult {
  importedCount: number
  skippedCount: number
}

export interface AppReadinessState {
  dependencyStatus: DependencyStatus
  profiles: AppProfileSummary[]
  runtimeConfig: RuntimeConfigState
  appSettings: AppSettingsState
  needsProfileSetup: boolean
  needsDependencySetup: boolean
  canImportLegacyProfiles: boolean
  needsKeychainAccessNotice: boolean
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
  profileId: string
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
  profileId: string
  instanceId: string
  instanceName: string
  cols: number
  rows: number
}

export interface SessionResizeRequest {
  sessionId: string
  cols: number
  rows: number
}

export type ShortcutCategory = 'favorite' | 'preset'
export type ShortcutLaunchKind = 'ssm' | 'tunnel'

export interface SsmShortcutPayload {
  instanceId: string
  instanceName: string
}

export type TunnelKind = 'db' | 'redis'

export interface TunnelShortcutPayload {
  targetId: string
  targetKind: TunnelKind
  targetName: string
  targetEndpoint: string
  remotePort: number
  jumpInstanceId: string
  jumpInstanceName: string
  preferredLocalPort: number
}

export type ShortcutPayload = SsmShortcutPayload | TunnelShortcutPayload

export interface SavedShortcutRecord {
  id: string
  category: ShortcutCategory
  label: string
  profileId: string
  profileName: string
  region: string
  launchKind: ShortcutLaunchKind
  payload: ShortcutPayload
  createdAt: string
  updatedAt: string
}

export interface RecentLaunchRecord {
  id: string
  label: string
  profileId: string
  profileName: string
  region: string
  launchKind: ShortcutLaunchKind
  payload: ShortcutPayload
  launchedAt: string
}

export interface QuickAccessState {
  favorites: SavedShortcutRecord[]
  presets: SavedShortcutRecord[]
  recents: RecentLaunchRecord[]
}

export interface CreateSavedShortcutRequest {
  category: ShortcutCategory
  label: string
  profileId: string
  profileName: string
  region: string
  launchKind: ShortcutLaunchKind
  payload: ShortcutPayload
}

export interface TunnelTargetSummary {
  id: string
  kind: TunnelKind
  name: string
  engine: string
  endpoint: string
  remotePort: number
  source: string
}

export interface S3BucketSummary {
  name: string
  regionHint?: string
}

export interface S3PrefixSummary {
  prefix: string
  name: string
}

export interface S3ObjectSummary {
  key: string
  name: string
  kind: 'object'
  size: number
  lastModified: string | null
  storageClass: string | null
}

export interface ListS3ObjectsRequest {
  profileId: string
  bucketName: string
  prefix: string
  query: string
}

export interface S3ObjectListResult {
  bucketName: string
  prefix: string
  prefixes: S3PrefixSummary[]
  objects: S3ObjectSummary[]
  isTruncated: boolean
  nextContinuationToken?: string
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
  profileId: string
  profileName: string
  region: string
  status: TunnelStatus
  openedAt: number
}

export interface OpenTunnelSessionRequest {
  profileId: string
  targetId: string
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

export type LaunchShortcutResult =
  | {
      launchKind: 'ssm'
      session: SessionTabState
    }
  | {
      launchKind: 'tunnel'
      session: TunnelSessionState
    }

export interface ElectronApi {
  getAppReadiness: () => Promise<AppReadinessState>
  listProfiles: () => Promise<AppProfileSummary[]>
  createProfile: (request: CreateProfileRequest) => Promise<AppProfileSummary>
  updateProfile: (request: UpdateProfileRequest) => Promise<AppProfileSummary>
  deleteProfile: (profileId: string) => Promise<void>
  getRuntimeConfig: () => Promise<RuntimeConfigState>
  updateRuntimePaths: (request: UpdateRuntimePathsRequest) => Promise<RuntimeConfigState>
  importLegacyProfiles: () => Promise<LegacyImportResult>
  dismissLegacyImport: () => Promise<void>
  acknowledgeKeychainAccessNotice: () => Promise<void>
  resetAppData: () => Promise<void>
  updateAppSettings: (request: UpdateAppSettingsRequest) => Promise<AppSettingsState>
  getQuickAccess: () => Promise<QuickAccessState>
  createSavedShortcut: (request: CreateSavedShortcutRequest) => Promise<SavedShortcutRecord>
  deleteSavedShortcut: (shortcutId: string) => Promise<void>
  launchShortcut: (shortcutId: string, terminalSize: { cols: number; rows: number }) => Promise<LaunchShortcutResult>
  listEc2Instances: (profileId: string) => Promise<Ec2InstanceSummary[]>
  listS3Buckets: (profileId: string) => Promise<S3BucketSummary[]>
  listS3Objects: (request: ListS3ObjectsRequest) => Promise<S3ObjectListResult>
  listTunnelTargets: (profileId: string, kind: TunnelKind) => Promise<TunnelTargetSummary[]>
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
