import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {
  AppSettingsState,
  AppProfileSummary,
  AppReadinessState,
  CreateSavedShortcutRequest,
  CreateProfileRequest,
  ListS3ObjectsRequest,
  OpenTunnelSessionRequest,
  OpenSessionRequest,
  RuntimeConfigState,
  SessionTabState,
  SessionErrorEvent,
  SessionExitEvent,
  SessionOutputEvent,
  TunnelSessionState,
  TunnelErrorEvent,
  TunnelExitEvent,
  TunnelKind,
  TunnelLogEvent,
  UpdateAppSettingsRequest,
  UpdateProfileRequest,
  UpdateRuntimePathsRequest
} from '../shared/contracts'
import { listCredentialProfiles } from './aws-config'
import { buildAppReadinessState } from './app-readiness'
import { detectDependencies } from './dependencies'
import { listEc2Instances } from './ec2-client'
import { ipcChannels } from './ipc'
import { resolvePreferredLocalPort } from './local-port-resolver'
import { AppProfileStore } from './profile-store'
import { QuickAccessLauncher } from './quick-access-launcher'
import { QuickAccessStore } from './quick-access-store'
import { registerRendererProtocol } from './renderer-protocol'
import { buildExecutionContext } from './runtime-context'
import { listS3Buckets, listS3Objects } from './s3-client'
import {
  shouldEnableRemoteDebugging,
  validateCreateSavedShortcutRequest,
  validateAwsRegion,
  validateCreateProfileRequest,
  validateListS3ObjectsRequest,
  validateOpenSessionRequest,
  validateOpenTunnelSessionRequest,
  validateUpdateAppSettingsRequest,
  validateUpdateProfileRequest,
  validateUpdateRuntimePathsRequest
} from './security'
import { SsmSessionManager } from './ssm-session-manager'
import { TunnelSessionManager } from './tunnel-session-manager'
import { listTunnelTargets } from './tunnel-targets'

let mainWindow: BrowserWindow | null = null
let profileStore: AppProfileStore | null = null
let quickAccessStore: QuickAccessStore | null = null

const sessionManager = new SsmSessionManager()
const tunnelSessionManager = new TunnelSessionManager()
const rendererUrl = process.env['ELECTRON_RENDERER_URL']
const remoteDebuggingPort = shouldEnableRemoteDebugging({
  remoteDebuggingPort: process.env['ELECTRON_REMOTE_DEBUGGING_PORT'],
  isPackaged: app.isPackaged,
  rendererUrl
})

if (remoteDebuggingPort) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort)
}

function getProfileStore(): AppProfileStore {
  if (!profileStore) {
    throw new Error('Profile store is unavailable before app startup.')
  }

  return profileStore
}

function getQuickAccessStore(): QuickAccessStore {
  if (!quickAccessStore) {
    throw new Error('Quick access store is unavailable before app startup.')
  }

  return quickAccessStore
}

function toProfileSummary(profile: AppProfileSummary): AppProfileSummary {
  return profile
}

function awsFilePath(filename: 'credentials' | 'config'): string {
  return path.join(os.homedir(), '.aws', filename)
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ''
    }

    throw error
  }
}

async function listStoredProfiles(): Promise<AppProfileSummary[]> {
  return (await getProfileStore().listProfiles()).map(toProfileSummary)
}

async function getRuntimeConfig(): Promise<RuntimeConfigState> {
  const settings = await getProfileStore().getRuntimeSettings()
  return {
    awsCliPath: settings.awsCliPath,
    sessionManagerPluginPath: settings.sessionManagerPluginPath
  }
}

async function getAppSettings(): Promise<AppSettingsState> {
  const settings = await getProfileStore().getRuntimeSettings()
  return {
    language: settings.language,
    theme: settings.theme,
    uiScale: settings.uiScale,
    selectedProfileId: settings.selectedProfileId
  }
}

async function hasLegacyProfiles(): Promise<boolean> {
  const credentialsContent = await readOptionalFile(awsFilePath('credentials'))
  return listCredentialProfiles(credentialsContent).length > 0
}

async function getAppReadiness(): Promise<AppReadinessState> {
  const [profiles, runtimeConfig, canImportLegacyProfiles, settings] = await Promise.all([
    listStoredProfiles(),
    getRuntimeConfig(),
    hasLegacyProfiles(),
    getProfileStore().getRuntimeSettings()
  ])
  const dependencyStatus = await detectDependencies(runtimeConfig)

  return buildAppReadinessState({
    dependencyStatus,
    profiles,
    runtimeConfig,
    appSettings: {
      language: settings.language,
      theme: settings.theme,
      uiScale: settings.uiScale,
      selectedProfileId: settings.selectedProfileId
    },
    canImportLegacyProfiles,
    keychainAccessNoticeAcceptedAt: settings.keychainAccessNoticeAcceptedAt
  })
}

async function resetWorkspaceState(): Promise<void> {
  await sessionManager.closeAllSessions()
  await tunnelSessionManager.closeAllTunnelSessions()
}

async function closeProfileWorkspaceState(profileId: string): Promise<void> {
  await Promise.all([
    ...sessionManager
      .listSessions()
      .filter((session) => session.profileId === profileId)
      .map((session) => sessionManager.closeSession(session.id)),
    ...tunnelSessionManager
      .listSessions()
      .filter((session) => session.profileId === profileId)
      .map((session) => tunnelSessionManager.closeTunnelSession(session.id))
  ])
}

async function requireProfileCredentials(profileId: string) {
  const activeProfile = await getProfileStore().getProfileCredentials(profileId)
  const dependencyStatus = await detectDependencies(await getRuntimeConfig())
  validateAwsRegion(activeProfile.profile.region)
  return { activeProfile, dependencyStatus }
}

async function requireExecutionContext(profileId: string) {
  const { activeProfile, dependencyStatus } = await requireProfileCredentials(profileId)
  return buildExecutionContext(activeProfile, dependencyStatus)
}

async function recordSsmRecentLaunch(context: Awaited<ReturnType<typeof requireExecutionContext>>, session: SessionTabState): Promise<void> {
  await getQuickAccessStore().recordRecentLaunch({
    label: `${session.instanceName} shell`,
    profileId: context.profile.id,
    profileName: context.profile.name,
    region: context.profile.region,
    launchKind: 'ssm',
    payload: {
      instanceId: session.instanceId,
      instanceName: session.instanceName
    }
  })
}

async function recordTunnelRecentLaunch(
  context: Awaited<ReturnType<typeof requireExecutionContext>>,
  session: TunnelSessionState,
  targetId: string
): Promise<void> {
  await getQuickAccessStore().recordRecentLaunch({
    label: `${session.targetName} tunnel`,
    profileId: context.profile.id,
    profileName: context.profile.name,
    region: context.profile.region,
    launchKind: 'tunnel',
    payload: {
      targetId,
      targetKind: session.targetKind,
      targetName: session.targetName,
      targetEndpoint: session.targetEndpoint,
      remotePort: session.remotePort,
      jumpInstanceId: session.jumpInstanceId,
      jumpInstanceName: session.jumpInstanceName,
      preferredLocalPort: session.localPort
    }
  })
}

function createQuickAccessLauncher(): QuickAccessLauncher {
  return new QuickAccessLauncher({
    quickAccessStore: getQuickAccessStore(),
    getExecutionContext: (profileId) => requireExecutionContext(profileId),
    listEc2Instances: async (profileId) => listEc2Instances((await requireProfileCredentials(profileId)).activeProfile),
    listTunnelTargets: async (profileId, kind: TunnelKind) =>
      listTunnelTargets((await requireProfileCredentials(profileId)).activeProfile, kind),
    openSsmSession: (options) => sessionManager.openSession(options),
    openTunnelSession: (options) => tunnelSessionManager.openTunnelSession(options),
    resolvePreferredTunnelPort: (port: number) => resolvePreferredLocalPort(port)
  })
}

function emitToRenderer<T>(channel: string, payload: T): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(channel, payload)
}

function registerSessionEvents(): void {
  sessionManager.on('output', (event: SessionOutputEvent) => {
    emitToRenderer(ipcChannels.sessionOutput, event)
  })

  sessionManager.on('exit', (event: SessionExitEvent) => {
    emitToRenderer(ipcChannels.sessionExit, event)
  })

  sessionManager.on('session-error', (event: SessionErrorEvent) => {
    emitToRenderer(ipcChannels.sessionError, event)
  })

  tunnelSessionManager.on('log', (event: TunnelLogEvent) => {
    emitToRenderer(ipcChannels.tunnelLog, event)
  })

  tunnelSessionManager.on('exit', (event: TunnelExitEvent) => {
    emitToRenderer(ipcChannels.tunnelExit, event)
  })

  tunnelSessionManager.on('error', (event: TunnelErrorEvent) => {
    emitToRenderer(ipcChannels.tunnelError, event)
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(ipcChannels.getAppReadiness, () => getAppReadiness())
  ipcMain.handle(ipcChannels.updateAppSettings, async (_event, request: UpdateAppSettingsRequest) => {
    const validatedRequest = validateUpdateAppSettingsRequest(request)
    const settings = await getProfileStore().updateRuntimeSettings({
      ...(validatedRequest.language !== undefined ? { language: validatedRequest.language ?? null } : {}),
      ...(validatedRequest.theme !== undefined ? { theme: validatedRequest.theme ?? null } : {}),
      ...(validatedRequest.uiScale !== undefined ? { uiScale: validatedRequest.uiScale ?? null } : {}),
      ...(validatedRequest.selectedProfileId !== undefined ? { selectedProfileId: validatedRequest.selectedProfileId ?? null } : {})
    })
    return {
      language: settings.language,
      theme: settings.theme,
      uiScale: settings.uiScale,
      selectedProfileId: settings.selectedProfileId
    }
  })
  ipcMain.handle(ipcChannels.listProfiles, () => listStoredProfiles())
  ipcMain.handle(ipcChannels.createProfile, async (_event, request: CreateProfileRequest) => {
    const profile = await getProfileStore().createProfile(validateCreateProfileRequest(request))
    return toProfileSummary(profile)
  })
  ipcMain.handle(ipcChannels.updateProfile, async (_event, request: UpdateProfileRequest) => {
    const profile = await getProfileStore().updateProfile(request.id, validateUpdateProfileRequest(request))
    await closeProfileWorkspaceState(request.id)
    return toProfileSummary(profile)
  })
  ipcMain.handle(ipcChannels.deleteProfile, async (_event, profileId: string) => {
    await closeProfileWorkspaceState(profileId)
    await getProfileStore().deleteProfile(profileId)
  })
  ipcMain.handle(ipcChannels.getRuntimeConfig, () => getRuntimeConfig())
  ipcMain.handle(ipcChannels.updateRuntimePaths, async (_event, request: UpdateRuntimePathsRequest) => {
    const settings = await getProfileStore().updateRuntimeSettings(validateUpdateRuntimePathsRequest(request))
    return {
      awsCliPath: settings.awsCliPath,
      sessionManagerPluginPath: settings.sessionManagerPluginPath
    }
  })
  ipcMain.handle(ipcChannels.importLegacyProfiles, async () => {
    const result = await getProfileStore().importLegacyProfiles({
      credentialsContent: await readOptionalFile(awsFilePath('credentials')),
      configContent: await readOptionalFile(awsFilePath('config'))
    })
    return result
  })
  ipcMain.handle(ipcChannels.dismissLegacyImport, async () => {
    await getProfileStore().updateRuntimeSettings({
      legacyImportDismissedAt: new Date().toISOString()
    })
  })
  ipcMain.handle(ipcChannels.acknowledgeKeychainAccessNotice, async () => {
    await getProfileStore().acceptKeychainAccessNotice()
  })
  ipcMain.handle(ipcChannels.resetAppData, async () => {
    await Promise.all([getProfileStore().resetAppData(), getQuickAccessStore().reset()])
    await resetWorkspaceState()
  })
  ipcMain.handle(ipcChannels.getQuickAccess, () => getQuickAccessStore().getQuickAccess())
  ipcMain.handle(ipcChannels.createSavedShortcut, async (_event, request: CreateSavedShortcutRequest) =>
    getQuickAccessStore().createSavedShortcut(validateCreateSavedShortcutRequest(request))
  )
  ipcMain.handle(ipcChannels.deleteSavedShortcut, async (_event, shortcutId: string) =>
    getQuickAccessStore().deleteSavedShortcut(shortcutId)
  )
  ipcMain.handle(
    ipcChannels.launchShortcut,
    async (_event, shortcutId: string, terminalSize: { cols: number; rows: number }) =>
      createQuickAccessLauncher().launchShortcut(shortcutId, terminalSize)
  )
  ipcMain.handle(ipcChannels.listS3Buckets, async (_event, profileId: string) =>
    listS3Buckets((await requireProfileCredentials(profileId)).activeProfile)
  )
  ipcMain.handle(ipcChannels.listS3Objects, async (_event, request: ListS3ObjectsRequest) =>
    listS3Objects((await requireProfileCredentials(request.profileId)).activeProfile, validateListS3ObjectsRequest(request))
  )
  ipcMain.handle(ipcChannels.listEc2Instances, async (_event, profileId: string) =>
    listEc2Instances((await requireProfileCredentials(profileId)).activeProfile)
  )
  ipcMain.handle(ipcChannels.listTunnelTargets, async (_event, profileId: string, kind: TunnelKind) =>
    listTunnelTargets((await requireProfileCredentials(profileId)).activeProfile, kind)
  )
  ipcMain.handle(ipcChannels.openTunnelSession, async (_event, request: OpenTunnelSessionRequest) => {
    const validatedRequest = validateOpenTunnelSessionRequest(request)
    const context = await requireExecutionContext(validatedRequest.profileId)
    const session = await tunnelSessionManager.openTunnelSession({
      profileId: context.profile.id,
      profileName: context.profile.name,
      region: context.profile.region,
      jumpInstanceId: validatedRequest.jumpInstanceId,
      jumpInstanceName: validatedRequest.jumpInstanceName,
      targetName: validatedRequest.targetName,
      targetKind: validatedRequest.targetKind,
      targetEndpoint: validatedRequest.targetEndpoint,
      remotePort: validatedRequest.remotePort,
      localPort: validatedRequest.localPort,
      awsCliPath: context.awsCliPath,
      env: context.env
    })
    await recordTunnelRecentLaunch(context, session, validatedRequest.targetId)
    return session
  })
  ipcMain.handle(ipcChannels.closeTunnelSession, async (_event, sessionId: string) =>
    tunnelSessionManager.closeTunnelSession(sessionId)
  )
  ipcMain.handle(ipcChannels.openSsmSession, async (_event, request: OpenSessionRequest) => {
    const validatedRequest = validateOpenSessionRequest(request)
    const context = await requireExecutionContext(validatedRequest.profileId)
    const session = await sessionManager.openSession({
      profileId: context.profile.id,
      profileName: context.profile.name,
      region: context.profile.region,
      instanceId: validatedRequest.instanceId,
      instanceName: validatedRequest.instanceName,
      cols: validatedRequest.cols,
      rows: validatedRequest.rows,
      awsCliPath: context.awsCliPath,
      env: context.env
    })
    await recordSsmRecentLaunch(context, session)
    return session
  })
  ipcMain.handle(ipcChannels.sendSessionInput, async (_event, sessionId: string, data: string) => {
    sessionManager.sendInput(sessionId, data)
  })
  ipcMain.handle(
    ipcChannels.resizeSession,
    async (_event, request: { sessionId: string; cols: number; rows: number }) => {
      sessionManager.resizeSession(request.sessionId, request.cols, request.rows)
    }
  )
  ipcMain.handle(ipcChannels.closeSession, async (_event, sessionId: string) => {
    await sessionManager.closeSession(sessionId)
  })
}

function createWindow(): BrowserWindow {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'aws-cloud.png')
    : path.join(process.cwd(), 'assets', 'aws-cloud.png')

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'AWS Cloud Console',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadURL('app://renderer/index.html')
  }

  return window
}

app.whenReady().then(() => {
  registerRendererProtocol(path.join(__dirname, '../renderer'))
  profileStore = new AppProfileStore({
    userDataPath: app.getPath('userData'),
    safeStorage
  })
  quickAccessStore = new QuickAccessStore({
    userDataPath: app.getPath('userData')
  })

  registerSessionEvents()
  registerIpcHandlers()
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void sessionManager.closeAllSessions()
  void tunnelSessionManager.closeAllTunnelSessions()
})
