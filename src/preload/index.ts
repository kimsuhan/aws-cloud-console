import { contextBridge, ipcRenderer } from 'electron'

import type {
  AppReadinessState,
  AppProfileSummary,
  CreateProfileRequest,
  Ec2InstanceSummary,
  ElectronApi,
  LegacyImportResult,
  OpenTunnelSessionRequest,
  OpenSessionRequest,
  SessionErrorEvent,
  SessionExitEvent,
  SessionOutputEvent,
  SessionResizeRequest,
  SessionTabState,
  TunnelErrorEvent,
  TunnelExitEvent,
  TunnelKind,
  TunnelLogEvent,
  TunnelSessionState,
  TunnelTargetSummary,
  RuntimeConfigState,
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
  listProfiles: () => ipcRenderer.invoke(ipcChannels.listProfiles) as Promise<AppProfileSummary[]>,
  createProfile: (request: CreateProfileRequest) =>
    ipcRenderer.invoke(ipcChannels.createProfile, request) as Promise<AppProfileSummary>,
  updateProfile: (request: UpdateProfileRequest) =>
    ipcRenderer.invoke(ipcChannels.updateProfile, request) as Promise<AppProfileSummary>,
  deleteProfile: (profileId: string) => ipcRenderer.invoke(ipcChannels.deleteProfile, profileId),
  selectActiveProfile: (profileId: string) =>
    ipcRenderer.invoke(ipcChannels.selectActiveProfile, profileId) as Promise<AppProfileSummary>,
  setDefaultProfile: (profileId: string) =>
    ipcRenderer.invoke(ipcChannels.setDefaultProfile, profileId) as Promise<AppProfileSummary>,
  getRuntimeConfig: () => ipcRenderer.invoke(ipcChannels.getRuntimeConfig) as Promise<RuntimeConfigState>,
  updateRuntimePaths: (request: UpdateRuntimePathsRequest) =>
    ipcRenderer.invoke(ipcChannels.updateRuntimePaths, request) as Promise<RuntimeConfigState>,
  importLegacyProfiles: () => ipcRenderer.invoke(ipcChannels.importLegacyProfiles) as Promise<LegacyImportResult>,
  dismissLegacyImport: () => ipcRenderer.invoke(ipcChannels.dismissLegacyImport),
  listEc2Instances: () => ipcRenderer.invoke(ipcChannels.listEc2Instances) as Promise<Ec2InstanceSummary[]>,
  listTunnelTargets: (kind: TunnelKind) =>
    ipcRenderer.invoke(ipcChannels.listTunnelTargets, kind) as Promise<TunnelTargetSummary[]>,
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
