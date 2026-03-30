import { app, BrowserWindow, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {
  ActiveProfileState,
  AppReadinessState,
  OpenTunnelSessionRequest,
  OpenSessionRequest,
  SessionErrorEvent,
  SessionExitEvent,
  SessionOutputEvent,
  TunnelErrorEvent,
  TunnelExitEvent,
  TunnelKind,
  TunnelLogEvent
} from '../shared/contracts'
import { listCredentialProfiles, resolveProfileRegion } from './aws-config'
import { detectDependencies } from './dependencies'
import { listEc2Instances } from './ec2-client'
import { ipcChannels } from './ipc'
import { SsmSessionManager } from './ssm-session-manager'
import { TunnelSessionManager } from './tunnel-session-manager'
import { listTunnelTargets } from './tunnel-targets'

let mainWindow: BrowserWindow | null = null
let activeProfile: ActiveProfileState | null = null

const sessionManager = new SsmSessionManager()
const tunnelSessionManager = new TunnelSessionManager()
const remoteDebuggingPort = process.env['ELECTRON_REMOTE_DEBUGGING_PORT']

if (remoteDebuggingPort) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort)
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

async function loadAwsProfiles(): Promise<string[]> {
  return listCredentialProfiles(await readOptionalFile(awsFilePath('credentials')))
}

async function getAppReadiness(): Promise<AppReadinessState> {
  const [dependencyStatus, profiles] = await Promise.all([detectDependencies(), loadAwsProfiles()])

  return {
    dependencyStatus,
    profiles: profiles.map((name) => ({ name })),
    activeProfile
  }
}

async function selectAwsProfile(profileName: string): Promise<ActiveProfileState> {
  const profiles = await loadAwsProfiles()

  if (!profiles.includes(profileName)) {
    throw new Error(`Profile "${profileName}" was not found in ~/.aws/credentials.`)
  }

  const configContent = await readOptionalFile(awsFilePath('config'))
  const region = resolveProfileRegion(profileName, configContent)

  if (!region) {
    throw new Error(`Profile "${profileName}" does not have a region in ~/.aws/config.`)
  }

  await sessionManager.closeAllSessions()
  activeProfile = {
    profileName,
    region
  }

  return activeProfile
}

async function setActiveRegion(region: string): Promise<ActiveProfileState> {
  const profile = requireActiveProfile()

  activeProfile = {
    ...profile,
    region
  }

  return activeProfile
}

async function resetActiveProfile(): Promise<void> {
  await sessionManager.closeAllSessions()
  await tunnelSessionManager.closeAllTunnelSessions()
  activeProfile = null
}

function requireActiveProfile(): ActiveProfileState {
  if (!activeProfile) {
    throw new Error('Select an AWS profile before running actions.')
  }

  return activeProfile
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
  ipcMain.handle(ipcChannels.listAwsProfiles, async () => (await loadAwsProfiles()).map((name) => ({ name })))
  ipcMain.handle(ipcChannels.selectAwsProfile, (_event, profileName: string) => selectAwsProfile(profileName))
  ipcMain.handle(ipcChannels.setActiveRegion, (_event, region: string) => setActiveRegion(region))
  ipcMain.handle(ipcChannels.resetActiveProfile, async () => resetActiveProfile())
  ipcMain.handle(ipcChannels.listEc2Instances, async () => listEc2Instances(requireActiveProfile()))
  ipcMain.handle(ipcChannels.listTunnelTargets, async (_event, kind: TunnelKind) =>
    listTunnelTargets(requireActiveProfile(), kind)
  )
  ipcMain.handle(ipcChannels.openTunnelSession, async (_event, request: OpenTunnelSessionRequest) => {
    const profile = requireActiveProfile()

    return tunnelSessionManager.openTunnelSession({
      profileName: profile.profileName,
      region: profile.region,
      jumpInstanceId: request.jumpInstanceId,
      jumpInstanceName: request.jumpInstanceName,
      targetName: request.targetName,
      targetKind: request.targetKind,
      targetEndpoint: request.targetEndpoint,
      remotePort: request.remotePort,
      localPort: request.localPort
    })
  })
  ipcMain.handle(ipcChannels.closeTunnelSession, async (_event, sessionId: string) =>
    tunnelSessionManager.closeTunnelSession(sessionId)
  )
  ipcMain.handle(ipcChannels.openSsmSession, async (_event, request: OpenSessionRequest) => {
    const profile = requireActiveProfile()

    return sessionManager.openSession({
      profileName: profile.profileName,
      region: profile.region,
      instanceId: request.instanceId,
      instanceName: request.instanceName
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
