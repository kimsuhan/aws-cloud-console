import { contextBridge, ipcRenderer } from 'electron'

import type {
  AppSettingsState,
  AppReadinessState,
  AppProfileSummary,
  CreateSavedShortcutRequest,
  CreateProfileRequest,
  Ec2InstanceSummary,
  ElectronApi,
  LegacyImportResult,
  LaunchShortcutResult,
  ListS3ObjectsRequest,
  OpenTunnelSessionRequest,
  OpenSessionRequest,
  QuickAccessState,
  SessionErrorEvent,
  SessionExitEvent,
  SessionOutputEvent,
  SessionResizeRequest,
  SessionTabState,
  S3BucketSummary,
  S3ObjectListResult,
  TunnelErrorEvent,
  TunnelExitEvent,
  TunnelKind,
  TunnelLogEvent,
  TunnelSessionState,
  TunnelTargetSummary,
  RuntimeConfigState,
  UpdateAppSettingsRequest,
  UpdateProfileRequest,
  UpdateRuntimePathsRequest
} from '../shared/contracts'
import { ipcChannels } from '../main/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => {
    listener(payload)
  }

  ipcRenderer.on(channel, wrapped)

  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const electronApi: ElectronApi = {
  getAppReadiness: () => ipcRenderer.invoke(ipcChannels.getAppReadiness) as Promise<AppReadinessState>,
  updateAppSettings: (request: UpdateAppSettingsRequest) =>
    ipcRenderer.invoke(ipcChannels.updateAppSettings, request) as Promise<AppSettingsState>,
  listProfiles: () => ipcRenderer.invoke(ipcChannels.listProfiles) as Promise<AppProfileSummary[]>,
  createProfile: (request: CreateProfileRequest) =>
    ipcRenderer.invoke(ipcChannels.createProfile, request) as Promise<AppProfileSummary>,
  updateProfile: (request: UpdateProfileRequest) =>
    ipcRenderer.invoke(ipcChannels.updateProfile, request) as Promise<AppProfileSummary>,
  deleteProfile: (profileId: string) => ipcRenderer.invoke(ipcChannels.deleteProfile, profileId),
  getRuntimeConfig: () => ipcRenderer.invoke(ipcChannels.getRuntimeConfig) as Promise<RuntimeConfigState>,
  updateRuntimePaths: (request: UpdateRuntimePathsRequest) =>
    ipcRenderer.invoke(ipcChannels.updateRuntimePaths, request) as Promise<RuntimeConfigState>,
  importLegacyProfiles: () => ipcRenderer.invoke(ipcChannels.importLegacyProfiles) as Promise<LegacyImportResult>,
  dismissLegacyImport: () => ipcRenderer.invoke(ipcChannels.dismissLegacyImport),
  acknowledgeKeychainAccessNotice: () => ipcRenderer.invoke(ipcChannels.acknowledgeKeychainAccessNotice),
  resetAppData: () => ipcRenderer.invoke(ipcChannels.resetAppData),
  getQuickAccess: () => ipcRenderer.invoke(ipcChannels.getQuickAccess) as Promise<QuickAccessState>,
  createSavedShortcut: (request: CreateSavedShortcutRequest) =>
    ipcRenderer.invoke(ipcChannels.createSavedShortcut, request),
  deleteSavedShortcut: (shortcutId: string) => ipcRenderer.invoke(ipcChannels.deleteSavedShortcut, shortcutId),
  launchShortcut: (shortcutId: string, terminalSize: { cols: number; rows: number }) =>
    ipcRenderer.invoke(ipcChannels.launchShortcut, shortcutId, terminalSize) as Promise<LaunchShortcutResult>,
  listEc2Instances: (profileId: string) => ipcRenderer.invoke(ipcChannels.listEc2Instances, profileId) as Promise<Ec2InstanceSummary[]>,
  listS3Buckets: (profileId: string) => ipcRenderer.invoke(ipcChannels.listS3Buckets, profileId) as Promise<S3BucketSummary[]>,
  listS3Objects: (request: ListS3ObjectsRequest) =>
    ipcRenderer.invoke(ipcChannels.listS3Objects, request) as Promise<S3ObjectListResult>,
  listTunnelTargets: (profileId: string, kind: TunnelKind) =>
    ipcRenderer.invoke(ipcChannels.listTunnelTargets, profileId, kind) as Promise<TunnelTargetSummary[]>,
  openTunnelSession: (request: OpenTunnelSessionRequest) =>
    ipcRenderer.invoke(ipcChannels.openTunnelSession, request) as Promise<TunnelSessionState>,
  closeTunnelSession: (sessionId: string) => ipcRenderer.invoke(ipcChannels.closeTunnelSession, sessionId),
  openSsmSession: (request: OpenSessionRequest) =>
    ipcRenderer.invoke(ipcChannels.openSsmSession, request) as Promise<SessionTabState>,
  sendSessionInput: (sessionId: string, data: string) => ipcRenderer.invoke(ipcChannels.sendSessionInput, sessionId, data),
  resizeSession: (request: SessionResizeRequest) => ipcRenderer.invoke(ipcChannels.resizeSession, request),
  closeSession: (sessionId: string) => ipcRenderer.invoke(ipcChannels.closeSession, sessionId),
  onSessionOutput: (listener: (event: SessionOutputEvent) => void) => subscribe(ipcChannels.sessionOutput, listener),
  onSessionExit: (listener: (event: SessionExitEvent) => void) => subscribe(ipcChannels.sessionExit, listener),
  onSessionError: (listener: (event: SessionErrorEvent) => void) => subscribe(ipcChannels.sessionError, listener),
  onTunnelLog: (listener: (event: TunnelLogEvent) => void) => subscribe(ipcChannels.tunnelLog, listener),
  onTunnelExit: (listener: (event: TunnelExitEvent) => void) => subscribe(ipcChannels.tunnelExit, listener),
  onTunnelError: (listener: (event: TunnelErrorEvent) => void) => subscribe(ipcChannels.tunnelError, listener)
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
