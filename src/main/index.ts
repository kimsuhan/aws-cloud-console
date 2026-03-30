import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {
  AppProfileSummary,
  AppReadinessState,
  CreateProfileRequest,
  OpenTunnelSessionRequest,
  OpenSessionRequest,
  RuntimeConfigState,
  SessionErrorEvent,
  SessionExitEvent,
  SessionOutputEvent,
  TunnelErrorEvent,
  TunnelExitEvent,
  TunnelKind,
  TunnelLogEvent,
  UpdateProfileRequest,
  UpdateRuntimePathsRequest
} from '../shared/contracts'
import { listCredentialProfiles } from './aws-config'
import { detectDependencies } from './dependencies'
import { listEc2Instances } from './ec2-client'
import { ipcChannels } from './ipc'
import { AppProfileStore } from './profile-store'
import { buildExecutionContext } from './runtime-context'
import { SsmSessionManager } from './ssm-session-manager'
import { TunnelSessionManager } from './tunnel-session-manager'
import { listTunnelTargets } from './tunnel-targets'

let mainWindow: BrowserWindow | null = null
let profileStore: AppProfileStore | null = null

const sessionManager = new SsmSessionManager()
const tunnelSessionManager = new TunnelSessionManager()
const remoteDebuggingPort = process.env['ELECTRON_REMOTE_DEBUGGING_PORT']

if (remoteDebuggingPort) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort)
}

function getProfileStore(): AppProfileStore {
  if (!profileStore) {
    throw new Error('Profile store is unavailable before app startup.')
  }

  return profileStore
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

async function hasLegacyProfiles(): Promise<boolean> {
  const settings = await getProfileStore().getRuntimeSettings()
  if (settings.legacyImportDismissedAt) {
    return false
  }

  const credentialsContent = await readOptionalFile(awsFilePath('credentials'))
  return listCredentialProfiles(credentialsContent).length > 0
}

async function getAppReadiness(): Promise<AppReadinessState> {
  const [profiles, activeProfile, runtimeConfig, canImportLegacyProfiles] = await Promise.all([
    listStoredProfiles(),
    getProfileStore().getActiveProfileCredentials(),
    getRuntimeConfig(),
    hasLegacyProfiles()
  ])
  const dependencyStatus = await detectDependencies(runtimeConfig)

  return {
    dependencyStatus,
    profiles,
    activeProfile: activeProfile?.profile ?? null,
    runtimeConfig,
    needsProfileSetup: profiles.length === 0,
    needsDependencySetup: !dependencyStatus.awsCli.installed || !dependencyStatus.sessionManagerPlugin.installed,
    canImportLegacyProfiles: profiles.length === 0 && canImportLegacyProfiles
  }
}

async function resetWorkspaceState(): Promise<void> {
  await sessionManager.closeAllSessions()
  await tunnelSessionManager.closeAllTunnelSessions()
}

async function requireActiveProfileCredentials() {
  const activeProfile = await getProfileStore().getActiveProfileCredentials()
  if (!activeProfile) {
    throw new Error('Create or select an app-managed AWS profile before running actions.')
  }

  return activeProfile
}

async function requireExecutionContext() {
  const activeProfile = await requireActiveProfileCredentials()
  const dependencyStatus = await detectDependencies(await getRuntimeConfig())
  return buildExecutionContext(activeProfile, dependencyStatus)
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
  ipcMain.handle(ipcChannels.listProfiles, () => listStoredProfiles())
  ipcMain.handle(ipcChannels.createProfile, async (_event, request: CreateProfileRequest) => {
    const profile = await getProfileStore().createProfile(request)
    await resetWorkspaceState()
    return toProfileSummary(profile)
  })
  ipcMain.handle(ipcChannels.updateProfile, async (_event, request: UpdateProfileRequest) => {
    const profile = await getProfileStore().updateProfile(request.id, request)
    const activeProfile = await getProfileStore().getActiveProfileCredentials()
    if (activeProfile?.profile.id === request.id) {
      await resetWorkspaceState()
    }
    return toProfileSummary(profile)
  })
  ipcMain.handle(ipcChannels.deleteProfile, async (_event, profileId: string) => {
    const activeProfile = await getProfileStore().getActiveProfileCredentials()
    await getProfileStore().deleteProfile(profileId)
    if (activeProfile?.profile.id === profileId) {
      await resetWorkspaceState()
    }
  })
  ipcMain.handle(ipcChannels.selectActiveProfile, async (_event, profileId: string) => {
    const profile = await getProfileStore().selectActiveProfile(profileId)
    await resetWorkspaceState()
    return toProfileSummary(profile)
  })
  ipcMain.handle(ipcChannels.setDefaultProfile, async (_event, profileId: string) => {
    const profile = await getProfileStore().setDefaultProfile(profileId)
    await resetWorkspaceState()
    return toProfileSummary(profile)
  })
  ipcMain.handle(ipcChannels.getRuntimeConfig, () => getRuntimeConfig())
  ipcMain.handle(ipcChannels.updateRuntimePaths, async (_event, request: UpdateRuntimePathsRequest) => {
    const settings = await getProfileStore().updateRuntimeSettings(request)
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
    await resetWorkspaceState()
    return result
  })
  ipcMain.handle(ipcChannels.dismissLegacyImport, async () => {
    await getProfileStore().updateRuntimeSettings({
      legacyImportDismissedAt: new Date().toISOString()
    })
  })
  ipcMain.handle(ipcChannels.listEc2Instances, async () => listEc2Instances(await requireActiveProfileCredentials()))
  ipcMain.handle(ipcChannels.listTunnelTargets, async (_event, kind: TunnelKind) =>
    listTunnelTargets(await requireActiveProfileCredentials(), kind)
  )
  ipcMain.handle(ipcChannels.openTunnelSession, async (_event, request: OpenTunnelSessionRequest) => {
    const context = await requireExecutionContext()

    return tunnelSessionManager.openTunnelSession({
      profileId: context.profile.id,
      profileName: context.profile.name,
      region: context.profile.region,
      jumpInstanceId: request.jumpInstanceId,
      jumpInstanceName: request.jumpInstanceName,
      targetName: request.targetName,
      targetKind: request.targetKind,
      targetEndpoint: request.targetEndpoint,
      remotePort: request.remotePort,
      localPort: request.localPort,
      awsCliPath: context.awsCliPath,
      env: context.env
    })
  })
  ipcMain.handle(ipcChannels.closeTunnelSession, async (_event, sessionId: string) =>
    tunnelSessionManager.closeTunnelSession(sessionId)
  )
  ipcMain.handle(ipcChannels.openSsmSession, async (_event, request: OpenSessionRequest) => {
    const context = await requireExecutionContext()

    return sessionManager.openSession({
      profileId: context.profile.id,
      profileName: context.profile.name,
      region: context.profile.region,
      instanceId: request.instanceId,
      instanceName: request.instanceName,
      awsCliPath: context.awsCliPath,
      env: context.env
    })
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  profileStore = new AppProfileStore({
    userDataPath: app.getPath('userData'),
    safeStorage
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
