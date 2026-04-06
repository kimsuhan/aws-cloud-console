import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  ActionId,
  AppLanguage,
  AppProfileSummary,
  AppReadinessState,
  AppTheme,
  AppUiScale,
  CreateSavedShortcutRequest,
  CreateProfileRequest,
  Ec2InstanceSummary,
  LaunchShortcutResult,
  OpenTunnelSessionRequest,
  QuickAccessState,
  ListS3ObjectsRequest,
  SessionErrorEvent,
  SessionExitEvent,
  SessionTabState,
  S3BucketSummary,
  S3ObjectListResult,
  TunnelErrorEvent,
  TunnelExitEvent,
  TunnelLogEvent,
  TunnelSessionState,
  TunnelTargetSummary,
  UpdateProfileRequest,
  UpdateRuntimePathsRequest
} from '@shared/contracts'

import { findRegionOption } from './region-catalog'
import { RegionPicker } from './components/RegionPicker'
import { SessionTerminal } from './components/SessionTerminal'
import { DashboardHome } from './dashboard-home'
import { resolveDisplayedAppSettings } from './displayed-app-settings'
import { Ec2Workspace } from './ec2-workspace'
import { I18nProvider, detectAppLanguage, translate } from './i18n'
import { runMotionSafeTransition } from './motion'
import { QuickAccessDashboard, buildSsmShortcutDraft, buildTunnelShortcutDraft } from './quick-access'
import { S3Workspace } from './s3-workspace'
import { SettingsDrawer } from './settings-drawer'
import { buildSsmSessionPanelStates } from './ssm-session-panel-state'
import { TunnelWorkspace, resolveTunnelActionState, type TunnelActionIssue, type TunnelDraftState } from './tunnel-workspace'
import { UtilityPanel, type UtilityPanelNotice } from './utility-panel'
import { WorkspaceRail } from './workspace-rail'

interface ProfileFormState {
  name: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}

interface RuntimePathFormState {
  awsCliPath: string
  sessionManagerPluginPath: string
}

interface ProfileEc2WorkspaceState {
  instances: Ec2InstanceSummary[]
  loading: boolean
  error: string | null
  pendingInstanceId: string | null
  selectedInstanceId: string | null
}

interface ProfileTunnelWorkspaceState {
  tunnelTargets: TunnelTargetSummary[]
  tunnelTargetsLoading: boolean
  tunnelTargetsError: string | null
  jumpInstances: Ec2InstanceSummary[]
  jumpInstancesLoading: boolean
  jumpInstancesError: string | null
  pendingTunnelOpen: boolean
  tunnelDraft: TunnelDraftState
}

interface ProfileS3WorkspaceState {
  buckets: S3BucketSummary[]
  bucketsLoading: boolean
  bucketsError: string | null
  selectedBucketName: string | null
  currentPrefix: string
  searchQuery: string
  submittedQuery: string
  objectList: S3ObjectListResult | null
  objectsLoading: boolean
  objectsError: string | null
}

type WorkspaceView = 'dashboard' | 'quick-access' | 'settings' | ActionId

function estimateInitialTerminalSize(uiScale: AppUiScale = 'system'): { cols: number; rows: number } {
  if (typeof window === 'undefined') {
    return { cols: 120, rows: 30 }
  }

  const estimatedWidth = Math.max(window.innerWidth - 360, 640)
  const estimatedHeight = Math.max(window.innerHeight - 180, 320)
  const scaleFactor = uiScaleFactor(uiScale)

  return {
    cols: Math.max(80, Math.floor(estimatedWidth / (9 * scaleFactor))),
    rows: Math.max(24, Math.floor(estimatedHeight / (22 * scaleFactor)))
  }
}

function emptyProfileForm(region = 'ap-northeast-2'): ProfileFormState {
  return {
    name: '',
    region,
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: ''
  }
}

function emptyEc2WorkspaceState(): ProfileEc2WorkspaceState {
  return {
    instances: [],
    loading: false,
    error: null,
    pendingInstanceId: null,
    selectedInstanceId: null
  }
}

function emptyTunnelWorkspaceState(): ProfileTunnelWorkspaceState {
  return {
    tunnelTargets: [],
    tunnelTargetsLoading: false,
    tunnelTargetsError: null,
    jumpInstances: [],
    jumpInstancesLoading: false,
    jumpInstancesError: null,
    pendingTunnelOpen: false,
    tunnelDraft: {
      kind: null,
      targetId: null,
      jumpInstanceId: null,
      localPort: ''
    }
  }
}

function emptyS3WorkspaceState(): ProfileS3WorkspaceState {
  return {
    buckets: [],
    bucketsLoading: false,
    bucketsError: null,
    selectedBucketName: null,
    currentPrefix: '',
    searchQuery: '',
    submittedQuery: '',
    objectList: null,
    objectsLoading: false,
    objectsError: null
  }
}

function missingDependencyMessage(readiness: AppReadinessState, language: AppLanguage): string | null {
  const missing: string[] = []

  if (!readiness.dependencyStatus.awsCli.installed) {
    missing.push(t(language, 'settings.dependency.awsCli'))
  }

  if (!readiness.dependencyStatus.sessionManagerPlugin.installed) {
    missing.push(t(language, 'settings.dependency.sessionManagerPlugin'))
  }

  return missing.length > 0 ? t(language, 'settings.runtimeMissing', { tools: missing.join(', ') }) : null
}

function t(language: AppLanguage, key: string, params?: Record<string, string | number>): string {
  return translate(language, key, params)
}

function tunnelActionIssueMessage(language: AppLanguage, issue: TunnelActionIssue): string {
  switch (issue) {
    case 'missing-kind':
      return t(language, 'tunnels.validation.missingKind')
    case 'missing-target':
      return t(language, 'tunnels.validation.missingTarget')
    case 'missing-jump':
      return t(language, 'tunnels.validation.missingJump')
    case 'missing-port':
      return t(language, 'tunnels.validation.missingPort')
    case 'invalid-port':
      return t(language, 'tunnels.validation.invalidPort')
    case 'selection-unavailable':
      return t(language, 'tunnels.validation.selectionUnavailable')
    default:
      return t(language, 'tunnels.validation.incomplete')
  }
}

function normalizeAppTheme(theme: AppTheme | null | undefined): AppTheme {
  return theme ?? 'system'
}

function normalizeAppUiScale(uiScale: AppUiScale | null | undefined): AppUiScale {
  return uiScale ?? 'system'
}

function uiScaleFactor(uiScale: AppUiScale): number {
  switch (uiScale) {
    case '90':
      return 0.9
    case '110':
      return 1.1
    case '120':
      return 1.2
    case 'system':
    case '100':
    default:
      return 1
  }
}

export function App(): React.JSX.Element {
  const [language, setLanguage] = useState<AppLanguage>(() =>
    typeof navigator === 'undefined' ? 'en' : detectAppLanguage(navigator.language)
  )
  const [theme, setTheme] = useState<AppTheme>('system')
  const [uiScale, setUiScale] = useState<AppUiScale>('system')
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [readiness, setReadiness] = useState<AppReadinessState | null>(null)
  const [quickAccess, setQuickAccess] = useState<QuickAccessState>({
    favorites: [],
    presets: [],
    recents: []
  })
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceView>('dashboard')
  const [notices, setNotices] = useState<UtilityPanelNotice[]>([])
  const [notificationActions, setNotificationActions] = useState<
    Record<string, { actionLabel?: string; onAction?: () => void; dismissAfterMs?: number }>
  >({})
  const [loading, setLoading] = useState(true)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sessionTabs, setSessionTabs] = useState<SessionTabState[]>([])
  const [tunnelTabs, setTunnelTabs] = useState<TunnelSessionState[]>([])
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({})
  const [tunnelErrors, setTunnelErrors] = useState<Record<string, string>>({})
  const [ec2WorkspaceByProfileId, setEc2WorkspaceByProfileId] = useState<Record<string, ProfileEc2WorkspaceState>>({})
  const tunnelLogRef = useRef<Record<string, string>>({})
  const [tunnelWorkspaceByProfileId, setTunnelWorkspaceByProfileId] = useState<Record<string, ProfileTunnelWorkspaceState>>({})
  const [s3WorkspaceByProfileId, setS3WorkspaceByProfileId] = useState<Record<string, ProfileS3WorkspaceState>>({})
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm())
  const [runtimePaths, setRuntimePaths] = useState<RuntimePathFormState>({
    awsCliPath: '',
    sessionManagerPluginPath: ''
  })
  const [profileFormError, setProfileFormError] = useState<string | null>(null)
  const [runtimeFormError, setRuntimeFormError] = useState<string | null>(null)
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [resetAppDataConfirmVisible, setResetAppDataConfirmVisible] = useState(false)
  const [resetAppDataConfirmationText, setResetAppDataConfirmationText] = useState('')
  const sessionOpenSizeRef = useRef<{ cols: number; rows: number }>(estimateInitialTerminalSize(uiScale))

  useEffect(() => {
    const updateEstimatedSize = () => {
      sessionOpenSizeRef.current = estimateInitialTerminalSize(uiScale)
    }

    updateEstimatedSize()
    window.addEventListener('resize', updateEstimatedSize)

    return () => {
      window.removeEventListener('resize', updateEstimatedSize)
    }
  }, [uiScale])

  async function refreshReadiness(): Promise<void> {
    const nextReadiness = await window.electronAPI.getAppReadiness()
    setReadiness(nextReadiness)
    if (nextReadiness.appSettings.language) {
      setLanguage(nextReadiness.appSettings.language)
    }
    setTheme(normalizeAppTheme(nextReadiness.appSettings.theme))
    setUiScale(normalizeAppUiScale(nextReadiness.appSettings.uiScale))
    setRuntimePaths({
      awsCliPath: nextReadiness.runtimeConfig.awsCliPath ?? '',
      sessionManagerPluginPath: nextReadiness.runtimeConfig.sessionManagerPluginPath ?? ''
    })
  }

  async function refreshQuickAccess(): Promise<void> {
    setQuickAccess(await window.electronAPI.getQuickAccess())
  }

  async function handleChangeLanguage(nextLanguage: AppLanguage): Promise<void> {
    setLanguage(nextLanguage)
    await window.electronAPI.updateAppSettings({
      language: nextLanguage
    })
    pushNotice('success', t(nextLanguage, 'settings.title'))
  }

  async function handleChangeTheme(nextTheme: AppTheme): Promise<void> {
    setTheme(nextTheme)
    await window.electronAPI.updateAppSettings({
      theme: nextTheme === 'system' ? null : nextTheme
    })
    pushNotice('info', t(language, `settings.themeNotice.${nextTheme}`))
  }

  async function handleChangeUiScale(nextUiScale: AppUiScale): Promise<void> {
    setUiScale(nextUiScale)
    await window.electronAPI.updateAppSettings({
      uiScale: nextUiScale === 'system' ? null : nextUiScale
    })
    pushNotice(
      'info',
      nextUiScale === 'system'
        ? t(language, 'settings.uiScaleNotice.system')
        : t(language, 'settings.uiScaleNotice.manual', { scale: t(language, `settings.uiScale.${nextUiScale}`) })
    )
  }

  async function handleSelectProfile(profileId: string): Promise<void> {
    setSelectedProfileId(profileId)

    try {
      await window.electronAPI.updateAppSettings({
        selectedProfileId: profileId
      })
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  function resetWorkspaceState(): void {
    setCurrentWorkspace('dashboard')
    setActiveTabId(null)
    setSessionTabs([])
    setTunnelTabs([])
    setSessionErrors({})
    setTunnelErrors({})
    setEc2WorkspaceByProfileId({})
    tunnelLogRef.current = {}
    setTunnelWorkspaceByProfileId({})
    setS3WorkspaceByProfileId({})
  }

  function getEc2WorkspaceState(profileId: string): ProfileEc2WorkspaceState {
    return ec2WorkspaceByProfileId[profileId] ?? emptyEc2WorkspaceState()
  }

  function updateEc2WorkspaceState(
    profileId: string,
    updater: (current: ProfileEc2WorkspaceState) => ProfileEc2WorkspaceState
  ): void {
    setEc2WorkspaceByProfileId((current) => ({
      ...current,
      [profileId]: updater(current[profileId] ?? emptyEc2WorkspaceState())
    }))
  }

  function getTunnelWorkspaceState(profileId: string): ProfileTunnelWorkspaceState {
    return tunnelWorkspaceByProfileId[profileId] ?? emptyTunnelWorkspaceState()
  }

  function updateTunnelWorkspaceState(
    profileId: string,
    updater: (current: ProfileTunnelWorkspaceState) => ProfileTunnelWorkspaceState
  ): void {
    setTunnelWorkspaceByProfileId((current) => ({
      ...current,
      [profileId]: updater(current[profileId] ?? emptyTunnelWorkspaceState())
    }))
  }

  function getS3WorkspaceState(profileId: string): ProfileS3WorkspaceState {
    return s3WorkspaceByProfileId[profileId] ?? emptyS3WorkspaceState()
  }

  function updateS3WorkspaceState(
    profileId: string,
    updater: (current: ProfileS3WorkspaceState) => ProfileS3WorkspaceState
  ): void {
    setS3WorkspaceByProfileId((current) => ({
      ...current,
      [profileId]: updater(current[profileId] ?? emptyS3WorkspaceState())
    }))
  }

  function removeProfileWorkspaceState(profileId: string): void {
    setSessionTabs((current) => current.filter((tab) => tab.profileId !== profileId))
    setTunnelTabs((current) => current.filter((tab) => tab.profileId !== profileId))
    setSessionErrors((current) => {
      const next = { ...current }
      sessionTabs.filter((tab) => tab.profileId === profileId).forEach((tab) => {
        delete next[tab.id]
      })
      return next
    })
    setTunnelErrors((current) => {
      const next = { ...current }
      tunnelTabs.filter((tab) => tab.profileId === profileId).forEach((tab) => {
        delete next[tab.id]
        delete tunnelLogRef.current[tab.id]
      })
      return next
    })
    setEc2WorkspaceByProfileId((current) => {
      const next = { ...current }
      delete next[profileId]
      return next
    })
    setTunnelWorkspaceByProfileId((current) => {
      const next = { ...current }
      delete next[profileId]
      return next
    })
    setS3WorkspaceByProfileId((current) => {
      const next = { ...current }
      delete next[profileId]
      return next
    })
    setActiveTabId((current) => {
      if (!current) {
        return current
      }

      const matchingSession = sessionTabs.find((tab) => tab.id === current && tab.profileId === profileId)
      const matchingTunnel = tunnelTabs.find((tab) => tab.id === current && tab.profileId === profileId)
      return matchingSession || matchingTunnel ? null : current
    })
  }

  function pushNotice(
    tone: UtilityPanelNotice['tone'],
    title: string,
    options?: { actionLabel?: string; onAction?: () => void; dismissAfterMs?: number }
  ): void {
    const id = `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const notice = { id, tone, title }

    setNotices((current) => [notice, ...current].slice(0, 12))
    setNotificationActions((current) => ({
      ...current,
      [id]: {
        actionLabel: options?.actionLabel,
        onAction: options?.onAction,
        dismissAfterMs: options?.dismissAfterMs ?? 4200
      }
    }))
  }

  function dismissNotification(_id: string): void {}

  function handleNotificationAction(id: string): void {
    const action = notificationActions[id]?.onAction
    if (!action) {
      return
    }

    action()
    dismissNotification(id)
  }

  function showQuickAccess(): void {
    setActiveTabId(null)
    setCurrentWorkspace('quick-access')
  }

  useEffect(() => {
    let cancelled = false

    void Promise.all([refreshReadiness(), refreshQuickAccess()]).then(
      () => {
        if (!cancelled) {
          setLoading(false)
        }
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }

        setSelectionError(error instanceof Error ? error.message : String(error))
        setLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement

    if (theme === 'system') {
      delete root.dataset.theme
      return
    }

    root.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', uiScaleFactor(uiScale).toString())
  }, [uiScale])

  useEffect(() => {
    if (!readiness?.profiles.length || editingProfileId) {
      return
    }

    setProfileForm((current) => ({
      ...current,
      region: readiness.profiles[0]?.region ?? current.region
    }))
  }, [editingProfileId, readiness?.profiles])

  useEffect(() => {
    if (!readiness) {
      return
    }

    const validProfileIds = new Set(readiness.profiles.map((profile) => profile.id))
    setEc2WorkspaceByProfileId((current) =>
      Object.fromEntries(Object.entries(current).filter(([profileId]) => validProfileIds.has(profileId)))
    )
    setTunnelWorkspaceByProfileId((current) =>
      Object.fromEntries(Object.entries(current).filter(([profileId]) => validProfileIds.has(profileId)))
    )
    setS3WorkspaceByProfileId((current) =>
      Object.fromEntries(Object.entries(current).filter(([profileId]) => validProfileIds.has(profileId)))
    )
  }, [readiness])

  useEffect(() => {
    if (!readiness) {
      return
    }

    const validProfileIds = new Set(readiness.profiles.map((profile) => profile.id))
    setSelectedProfileId((current) => {
      if (current && validProfileIds.has(current)) {
        return current
      }

      const persistedProfileId = readiness.appSettings.selectedProfileId
      if (persistedProfileId && validProfileIds.has(persistedProfileId)) {
        return persistedProfileId
      }

      return readiness.profiles[0]?.id ?? null
    })
  }, [readiness])

  useEffect(() => {
    const unsubscribeExit = window.electronAPI.onSessionExit((event: SessionExitEvent) => {
      setSessionTabs((current) =>
        current.map((tab) => (tab.id === event.sessionId ? { ...tab, status: 'closed' } : tab))
      )
    })

    const unsubscribeError = window.electronAPI.onSessionError((event: SessionErrorEvent) => {
      setSessionErrors((current) => ({
        ...current,
        [event.sessionId]: event.message
      }))
      pushNotice('error', event.message)

      setSessionTabs((current) =>
        current.map((tab) => (tab.id === event.sessionId ? { ...tab, status: 'error' } : tab))
      )
    })

    const unsubscribeTunnelLog = window.electronAPI.onTunnelLog((event: TunnelLogEvent) => {
      tunnelLogRef.current[event.sessionId] = `${tunnelLogRef.current[event.sessionId] ?? ''}${event.data}`
      setTunnelTabs((current) =>
        current.map((tab) =>
          tab.id === event.sessionId && tab.status === 'connecting' ? { ...tab, status: 'open' } : tab
        )
      )
    })

    const unsubscribeTunnelExit = window.electronAPI.onTunnelExit((event: TunnelExitEvent) => {
      setTunnelTabs((current) =>
        current.map((tab) => {
          if (tab.id !== event.sessionId) {
            return tab
          }

          return {
            ...tab,
            status: event.code === 0 ? 'reconnecting' : 'closed'
          }
        })
      )
    })

    const unsubscribeTunnelError = window.electronAPI.onTunnelError((event: TunnelErrorEvent) => {
      setTunnelErrors((current) => ({
        ...current,
        [event.sessionId]: event.message
      }))
      pushNotice('error', event.message)

      setTunnelTabs((current) =>
        current.map((tab) => (tab.id === event.sessionId ? { ...tab, status: 'error' } : tab))
      )
    })

    return () => {
      unsubscribeExit()
      unsubscribeError()
      unsubscribeTunnelLog()
      unsubscribeTunnelExit()
      unsubscribeTunnelError()
    }
  }, [])

  useEffect(() => {
    if (!readiness || currentWorkspace !== 'ec2-ssm-connect') {
      return
    }

    let cancelled = false

    if (!selectedProfileId) {
      return
    }

    updateEc2WorkspaceState(selectedProfileId, (current) => ({
      ...current,
      loading: true,
      error: null
    }))

    void window.electronAPI.listEc2Instances(selectedProfileId).then(
      (nextInstances) => {
        if (cancelled) {
          return
        }

        updateEc2WorkspaceState(selectedProfileId, (current) => ({
          ...current,
          instances: nextInstances,
          selectedInstanceId:
            current.selectedInstanceId ?? nextInstances.find((instance) => instance.state === 'running')?.id ?? null,
          loading: false
        }))
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }

        updateEc2WorkspaceState(selectedProfileId, (current) => ({
          ...current,
          error: error instanceof Error ? error.message : String(error),
          loading: false
        }))
      }
    )

    return () => {
      cancelled = true
    }
  }, [currentWorkspace, readiness, selectedProfileId])

  useEffect(() => {
    if (!readiness || currentWorkspace !== 'aws-tunneling') {
      return
    }

    let cancelled = false

    if (!selectedProfileId) {
      return
    }

    updateTunnelWorkspaceState(selectedProfileId, (current) => ({
      ...current,
      jumpInstancesLoading: true,
      jumpInstancesError: null
    }))

    void window.electronAPI.listEc2Instances(selectedProfileId).then(
      (nextInstances) => {
        if (cancelled) {
          return
        }

        updateTunnelWorkspaceState(selectedProfileId, (current) => ({
          ...current,
          jumpInstances: nextInstances.filter((instance) => instance.state === 'running'),
          jumpInstancesLoading: false
        }))
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }

        updateTunnelWorkspaceState(selectedProfileId, (current) => ({
          ...current,
          jumpInstancesError: error instanceof Error ? error.message : String(error),
          jumpInstancesLoading: false
        }))
      }
    )

    return () => {
      cancelled = true
    }
  }, [currentWorkspace, readiness, selectedProfileId])

  useEffect(() => {
    if (!readiness || currentWorkspace !== 's3-browser' || !selectedProfileId) {
      return
    }

    const s3State = getS3WorkspaceState(selectedProfileId)

    if (!s3State.bucketsLoading && s3State.buckets.length === 0 && !s3State.bucketsError) {
      void refreshS3Buckets(selectedProfileId)
      return
    }

    if (s3State.selectedBucketName && !s3State.objectsLoading && !s3State.objectList && !s3State.objectsError) {
      void refreshS3Objects(selectedProfileId)
    }
  }, [currentWorkspace, readiness, selectedProfileId])

  async function refreshEc2Profile(profileId: string): Promise<void> {
    updateEc2WorkspaceState(profileId, (current) => ({
      ...current,
      loading: true,
      error: null
    }))

    try {
      const nextInstances = await window.electronAPI.listEc2Instances(profileId)
      updateEc2WorkspaceState(profileId, (current) => ({
        ...current,
        instances: nextInstances,
        selectedInstanceId:
          current.selectedInstanceId ?? nextInstances.find((instance) => instance.state === 'running')?.id ?? null,
        loading: false
      }))
    } catch (error) {
      updateEc2WorkspaceState(profileId, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
        loading: false
      }))
    }
  }

  async function refreshTunnelTargets(profileId: string, kind: NonNullable<TunnelDraftState['kind']>): Promise<void> {
    updateTunnelWorkspaceState(profileId, (current) => ({
      ...current,
      tunnelTargetsLoading: true,
      tunnelTargetsError: null
    }))

    try {
      const targets = await window.electronAPI.listTunnelTargets(profileId, kind)
      updateTunnelWorkspaceState(profileId, (current) => ({
        ...current,
        tunnelTargets: targets,
        tunnelTargetsLoading: false
      }))
    } catch (error) {
      updateTunnelWorkspaceState(profileId, (current) => ({
        ...current,
        tunnelTargetsError: error instanceof Error ? error.message : String(error),
        tunnelTargetsLoading: false
      }))
    }
  }

  async function refreshS3Buckets(profileId: string): Promise<void> {
    updateS3WorkspaceState(profileId, (current) => ({
      ...current,
      bucketsLoading: true,
      bucketsError: null
    }))

    try {
      const nextBuckets = await window.electronAPI.listS3Buckets(profileId)
      const currentState = getS3WorkspaceState(profileId)
      const selectedBucketName =
        currentState.selectedBucketName && nextBuckets.some((bucket) => bucket.name === currentState.selectedBucketName)
          ? currentState.selectedBucketName
          : nextBuckets[0]?.name ?? null

      updateS3WorkspaceState(profileId, (current) => ({
        ...current,
        buckets: nextBuckets,
        bucketsLoading: false,
        selectedBucketName,
        currentPrefix: selectedBucketName === current.selectedBucketName ? current.currentPrefix : '',
        searchQuery: selectedBucketName === current.selectedBucketName ? current.searchQuery : '',
        submittedQuery: selectedBucketName === current.selectedBucketName ? current.submittedQuery : '',
        objectList: selectedBucketName === current.selectedBucketName ? current.objectList : null,
        objectsError: selectedBucketName === current.selectedBucketName ? current.objectsError : null
      }))

      if (selectedBucketName) {
        const prefix = selectedBucketName === currentState.selectedBucketName ? currentState.currentPrefix : ''
        const query = selectedBucketName === currentState.selectedBucketName ? currentState.submittedQuery : ''
        await refreshS3Objects(profileId, {
          bucketName: selectedBucketName,
          currentPrefix: prefix,
          submittedQuery: query
        })
      }
    } catch (error) {
      updateS3WorkspaceState(profileId, (current) => ({
        ...current,
        bucketsError: error instanceof Error ? error.message : String(error),
        bucketsLoading: false
      }))
    }
  }

  async function refreshS3Objects(
    profileId: string,
    options?: {
      bucketName?: string
      currentPrefix?: string
      submittedQuery?: string
    }
  ): Promise<void> {
    const currentState = getS3WorkspaceState(profileId)
    const bucketName = options?.bucketName ?? currentState.selectedBucketName

    if (!bucketName) {
      return
    }

    const currentPrefix = options?.currentPrefix ?? currentState.currentPrefix
    const submittedQuery = options?.submittedQuery ?? currentState.submittedQuery

    updateS3WorkspaceState(profileId, (current) => ({
      ...current,
      objectsLoading: true,
      objectsError: null
    }))

    try {
      const request: ListS3ObjectsRequest = {
        profileId,
        bucketName,
        prefix: currentPrefix,
        query: submittedQuery
      }
      const objectList = await window.electronAPI.listS3Objects(request)

      updateS3WorkspaceState(profileId, (current) => ({
        ...current,
        selectedBucketName: bucketName,
        currentPrefix,
        submittedQuery,
        objectList,
        objectsLoading: false
      }))
    } catch (error) {
      updateS3WorkspaceState(profileId, (current) => ({
        ...current,
        objectsError: error instanceof Error ? error.message : String(error),
        objectsLoading: false
      }))
    }
  }

  const activeTab = useMemo(
    () => sessionTabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, sessionTabs]
  )
  const activeTunnelTab = useMemo(
    () => tunnelTabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tunnelTabs]
  )
  const ssmSessionPanels = useMemo(
    () => buildSsmSessionPanelStates(sessionTabs, activeTabId),
    [activeTabId, sessionTabs]
  )
  const allTabs = useMemo(() => [...sessionTabs, ...tunnelTabs], [sessionTabs, tunnelTabs])
  const favoriteShortcutIdsByInstance = useMemo(() => {
    const favoriteMap = new Map<string, string>()

    quickAccess.favorites.forEach((shortcut) => {
      if (shortcut.launchKind !== 'ssm') {
        return
      }

      favoriteMap.set(`${shortcut.profileId}:${shortcut.payload.instanceId}`, shortcut.id)
    })

    return favoriteMap
  }, [quickAccess.favorites])

  function resetTunnelDraft(profileId: string): void {
    updateTunnelWorkspaceState(profileId, (current) => ({
      ...current,
      tunnelTargetsError: null,
      tunnelTargets: [],
      tunnelDraft: {
        kind: null,
        targetId: null,
        jumpInstanceId: null,
        localPort: ''
      }
    }))
  }

  function beginCreateProfile(): void {
    setEditingProfileId(null)
    setProfileForm(emptyProfileForm(readiness?.profiles[0]?.region ?? 'ap-northeast-2'))
    setProfileFormError(null)
  }

  function beginEditProfile(profile: AppProfileSummary): void {
    setEditingProfileId(profile.id)
    setProfileForm({
      name: profile.name,
      region: profile.region,
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: ''
    })
    setProfileFormError(null)
  }

  async function submitProfileForm(): Promise<void> {
    setProfileFormError(null)

    if (!profileForm.name.trim() || !profileForm.region.trim()) {
      setProfileFormError('Profile name and region are required.')
      return
    }

    if (!editingProfileId && (!profileForm.accessKeyId.trim() || !profileForm.secretAccessKey.trim())) {
      setProfileFormError('Access key id and secret access key are required.')
      return
    }

    try {
      if (editingProfileId) {
        const request: UpdateProfileRequest = {
          id: editingProfileId,
          name: profileForm.name.trim(),
          region: profileForm.region,
          accessKeyId: profileForm.accessKeyId.trim() || undefined,
          secretAccessKey: profileForm.secretAccessKey.trim() || undefined,
          sessionToken: profileForm.sessionToken.trim() || undefined
        }
        await window.electronAPI.updateProfile(request)
        removeProfileWorkspaceState(editingProfileId)
      } else {
        const request: CreateProfileRequest = {
          name: profileForm.name.trim(),
          region: profileForm.region,
          accessKeyId: profileForm.accessKeyId.trim(),
          secretAccessKey: profileForm.secretAccessKey.trim(),
          sessionToken: profileForm.sessionToken.trim() || undefined
        }
        await window.electronAPI.createProfile(request)
      }

      await refreshReadiness()
      beginCreateProfile()
    } catch (error) {
      setProfileFormError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDeleteProfile(profileId: string): Promise<void> {
    if (!window.confirm(t(appLanguage, 'settings.deleteProfileConfirm'))) {
      return
    }

    try {
      await window.electronAPI.deleteProfile(profileId)
      removeProfileWorkspaceState(profileId)
      await refreshReadiness()
      if (editingProfileId === profileId) {
        beginCreateProfile()
      }
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleImportLegacyProfiles(): Promise<void> {
    setSelectionError(null)

    try {
      await window.electronAPI.importLegacyProfiles()
      await refreshReadiness()
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleAcknowledgeKeychainAccessNotice(): Promise<void> {
    setSelectionError(null)

    try {
      await window.electronAPI.acknowledgeKeychainAccessNotice()
      await refreshReadiness()
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  function beginResetAppData(): void {
    setSelectionError(null)
    setResetAppDataConfirmationText('')
    setResetAppDataConfirmVisible(true)
  }

  async function handleResetAppData(): Promise<void> {
    setSelectionError(null)

    try {
      if (resetAppDataConfirmationText !== 'RESET') {
        return
      }

      await window.electronAPI.resetAppData()
      setResetAppDataConfirmVisible(false)
      setResetAppDataConfirmationText('')
      resetWorkspaceState()
      await Promise.all([refreshReadiness(), refreshQuickAccess()])
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSaveRuntimePaths(): Promise<void> {
    setRuntimeFormError(null)

    try {
      const request: UpdateRuntimePathsRequest = {
        awsCliPath: runtimePaths.awsCliPath.trim() || null,
        sessionManagerPluginPath: runtimePaths.sessionManagerPluginPath.trim() || null
      }
      await window.electronAPI.updateRuntimePaths(request)
      await refreshReadiness()
    } catch (error) {
      setRuntimeFormError(error instanceof Error ? error.message : String(error))
    }
  }

  function getSidebarTabTitle(tab: SessionTabState | TunnelSessionState): string {
    if ('title' in tab) {
      return tab.title
    }

    return t(appLanguage, 'shell.tunnelTabTitle', { name: tab.targetName })
  }

  function getSidebarTabSubtitle(tab: SessionTabState | TunnelSessionState): string {
    if ('instanceId' in tab) {
      return `${tab.instanceId} · ${tab.status}`
    }

    return `localhost:${tab.localPort} · ${tab.status}`
  }

  function applyShortcutLaunchResult(result: LaunchShortcutResult): void {
    if (result.launchKind === 'ssm') {
      const session = { ...result.session, status: 'open' as const }
      setSessionTabs((current) => [...current, session])
      setActiveTabId(session.id)
      return
    }

    setTunnelTabs((current) => [...current, result.session])
    tunnelLogRef.current[result.session.id] = tunnelLogRef.current[result.session.id] ?? ''
    setActiveTabId(result.session.id)
  }

  async function handleCreateSavedShortcut(
    request: CreateSavedShortcutRequest,
    options?: { revealQuickAccess?: boolean }
  ): Promise<void> {
    try {
      await window.electronAPI.createSavedShortcut(request)
      await refreshQuickAccess()
      const message =
        request.category === 'favorite'
          ? t(language, 'shell.savedToFavorites', { label: request.label })
          : t(language, 'shell.savedToPresets', { label: request.label })
      pushNotice('success', message, {
        actionLabel: t(language, 'shell.openQuickAccess'),
        onAction: () => showQuickAccess(),
        dismissAfterMs: 6400
      })
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleLaunchShortcut(shortcutId: string): Promise<void> {
    try {
      const result = await window.electronAPI.launchShortcut(shortcutId, {
        cols: sessionOpenSizeRef.current.cols,
        rows: sessionOpenSizeRef.current.rows
      })
      applyShortcutLaunchResult(result)
      pushNotice('info', t(language, 'shell.shortcutLaunched'))
      await Promise.all([refreshReadiness(), refreshQuickAccess()])
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDeleteSavedShortcut(shortcutId: string): Promise<void> {
    try {
      await window.electronAPI.deleteSavedShortcut(shortcutId)
      await refreshQuickAccess()
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpenSession(profile: AppProfileSummary, instance: Ec2InstanceSummary): Promise<void> {
    updateEc2WorkspaceState(profile.id, (current) => ({
      ...current,
      pendingInstanceId: instance.id
    }))

    try {
      const session = await window.electronAPI.openSsmSession({
        profileId: profile.id,
        instanceId: instance.id,
        instanceName: instance.name,
        cols: sessionOpenSizeRef.current.cols,
        rows: sessionOpenSizeRef.current.rows
      })

      setSessionTabs((current) => [...current, { ...session, status: 'open' }])
      setActiveTabId(session.id)
      pushNotice('info', t(language, 'shell.openedShell', { name: instance.name }))
      await refreshQuickAccess()
    } catch (error) {
      updateEc2WorkspaceState(profile.id, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }))
    } finally {
      updateEc2WorkspaceState(profile.id, (current) => ({
        ...current,
        pendingInstanceId: null
      }))
    }
  }

  async function handleCloseTab(sessionId: string): Promise<void> {
    if (tunnelTabs.some((tab) => tab.id === sessionId)) {
      await window.electronAPI.closeTunnelSession(sessionId)

      const remainingTunnelTabs = tunnelTabs.filter((tab) => tab.id !== sessionId)
      setTunnelTabs(remainingTunnelTabs)
      delete tunnelLogRef.current[sessionId]
      setTunnelErrors((current) => {
        const next = { ...current }
        delete next[sessionId]
        return next
      })
      setActiveTabId((current) => {
        if (current !== sessionId) {
          return current
        }

        return remainingTunnelTabs[0]?.id ?? null
      })
      if (activeTabId === sessionId && remainingTunnelTabs.length === 0 && sessionTabs.length === 0) {
        setCurrentWorkspace('dashboard')
      }
      return
    }

    await window.electronAPI.closeSession(sessionId)

    const remainingTabs = sessionTabs.filter((tab) => tab.id !== sessionId)
    setSessionTabs(remainingTabs)
    setSessionErrors((current) => {
      const next = { ...current }
      delete next[sessionId]
      return next
    })

    setActiveTabId((current) => {
      if (current !== sessionId) {
        return current
      }

      return remainingTabs[0]?.id ?? null
    })
  }

  async function handleOpenTunnel(profile: AppProfileSummary): Promise<void> {
    const tunnelState = getTunnelWorkspaceState(profile.id)
    const nextTunnelActionState = resolveTunnelActionState({
      tunnelDraft: tunnelState.tunnelDraft,
      tunnelTargets: tunnelState.tunnelTargets,
      jumpInstances: tunnelState.jumpInstances
    })

    if (nextTunnelActionState.issue) {
      updateTunnelWorkspaceState(profile.id, (current) => ({
        ...current,
        tunnelTargetsError: tunnelActionIssueMessage(language, nextTunnelActionState.issue)
      }))
      return
    }

    updateTunnelWorkspaceState(profile.id, (current) => ({
      ...current,
      pendingTunnelOpen: true,
      tunnelTargetsError: null
    }))

    try {
      const request: OpenTunnelSessionRequest = {
        profileId: profile.id,
        targetId: nextTunnelActionState.selectedTarget.id,
        targetName: nextTunnelActionState.selectedTarget.name,
        targetKind: nextTunnelActionState.selectedTarget.kind,
        targetEndpoint: nextTunnelActionState.selectedTarget.endpoint,
        remotePort: nextTunnelActionState.selectedTarget.remotePort,
        localPort: nextTunnelActionState.localPort,
        jumpInstanceId: nextTunnelActionState.selectedJumpHost.id,
        jumpInstanceName: nextTunnelActionState.selectedJumpHost.name
      }
      const session = await window.electronAPI.openTunnelSession(request)

      setTunnelTabs((current) => [...current, session])
      tunnelLogRef.current[session.id] = ''
      setActiveTabId(session.id)
      resetTunnelDraft(profile.id)
      pushNotice('info', t(language, 'shell.openedTunnel', { name: nextTunnelActionState.selectedTarget.name, port: session.localPort }))
      await refreshQuickAccess()
    } catch (error) {
      updateTunnelWorkspaceState(profile.id, (current) => ({
        ...current,
        tunnelTargetsError: error instanceof Error ? error.message : String(error)
      }))
    } finally {
      updateTunnelWorkspaceState(profile.id, (current) => ({
        ...current,
        pendingTunnelOpen: false
      }))
    }
  }

  if (loading || !readiness) {
    return <div className="state-screen terminal-theme">Initializing workspace...</div>
  }

  const { appLanguage, appTheme, appUiScale } = resolveDisplayedAppSettings(readiness, {
    language,
    theme,
    uiScale
  })
  const missingDependencies = missingDependencyMessage(readiness, appLanguage)
  const liveItems = allTabs.map((tab) => ({
    id: tab.id,
    label: getSidebarTabTitle(tab),
    meta: getSidebarTabSubtitle(tab),
    status: tab.status
  }))
  const toastItems = notices.slice(0, 4).map((notice) => ({
    ...notice,
    actionLabel: notificationActions[notice.id]?.actionLabel,
    onAction: notificationActions[notice.id]?.onAction,
    dismissAfterMs: notificationActions[notice.id]?.dismissAfterMs
  }))
  const liveTabs = allTabs.map((tab) => ({
    id: tab.id,
    title: getSidebarTabTitle(tab),
    subtitle: getSidebarTabSubtitle(tab),
    active: activeTabId === tab.id
  }))
  const selectedProfile = selectedProfileId
    ? readiness.profiles.find((profile) => profile.id === selectedProfileId) ?? null
    : null

  if (readiness.profiles.length === 0) {
    return (
      <I18nProvider language={appLanguage}>
        <main className="gate-layout">
          <section className="gate-card">
            <p className="eyebrow">{t(appLanguage, 'shell.appProfiles')}</p>
            <h1>{t(appLanguage, 'shell.createFirstProfile')}</h1>
            <p className="body">{t(appLanguage, 'shell.createFirstProfileCopy')}</p>

            {selectionError ? (
              <div className="callout callout-error">
                <strong>{t(appLanguage, 'shell.profileSetupFailed')}</strong>
                <p>{selectionError}</p>
              </div>
            ) : null}

            {profileFormError ? (
              <div className="callout callout-error">
                <strong>{t(appLanguage, 'shell.profileValidationFailed')}</strong>
                <p>{profileFormError}</p>
              </div>
            ) : null}

            {readiness.canImportLegacyProfiles ? (
              <div className="callout gate-callout">
                <strong>{t(appLanguage, 'shell.legacyDetected')}</strong>
                <p>{t(appLanguage, 'shell.legacyCopy')}</p>
                <div className="tunnel-builder-actions">
                  <button className="toolbar-button" onClick={() => void handleImportLegacyProfiles()} type="button">
                    {t(appLanguage, 'shell.importProfiles')}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="profile-form">
              <label className="form-field">
                <span className="form-field-label">{t(appLanguage, 'settings.profileName')}</span>
                <input
                  className="tunnel-input"
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t(appLanguage, 'settings.profileNamePlaceholder')}
                  value={profileForm.name}
                />
              </label>
              <label className="form-field">
                <span className="form-field-label">{t(appLanguage, 'settings.defaultRegion')}</span>
                <RegionPicker
                  ariaLabel={t(appLanguage, 'settings.defaultRegion')}
                  value={profileForm.region}
                  onChange={(region) => setProfileForm((current) => ({ ...current, region }))}
                />
              </label>
              <label className="form-field">
                <span className="form-field-label">{t(appLanguage, 'settings.accessKeyId')}</span>
                <input
                  className="tunnel-input"
                  onChange={(event) => setProfileForm((current) => ({ ...current, accessKeyId: event.target.value }))}
                  placeholder={t(appLanguage, 'settings.accessKeyPlaceholder')}
                  value={profileForm.accessKeyId}
                />
              </label>
              <label className="form-field">
                <span className="form-field-label">{t(appLanguage, 'settings.secretAccessKey')}</span>
                <input
                  className="tunnel-input"
                  onChange={(event) => setProfileForm((current) => ({ ...current, secretAccessKey: event.target.value }))}
                  placeholder={t(appLanguage, 'settings.secretAccessKey')}
                  type="password"
                  value={profileForm.secretAccessKey}
                />
              </label>
              <label className="form-field">
                <span className="form-field-label">{t(appLanguage, 'settings.sessionToken')}</span>
                <input
                  className="tunnel-input"
                  onChange={(event) => setProfileForm((current) => ({ ...current, sessionToken: event.target.value }))}
                  placeholder={t(appLanguage, 'settings.sessionTokenPlaceholder')}
                  type="password"
                  value={profileForm.sessionToken}
                />
              </label>
            </div>

            <div className="tunnel-builder-actions">
              <button className="new-tab-button primary-button gate-primary-action" onClick={() => void submitProfileForm()} type="button">
                {t(appLanguage, 'settings.saveProfile')}
              </button>
            </div>
          </section>
        </main>
      </I18nProvider>
    )
  }

  if (readiness.needsKeychainAccessNotice) {
    return (
      <I18nProvider language={appLanguage}>
        <main className="gate-layout">
          <section className="gate-card">
            <p className="eyebrow">{t(appLanguage, 'shell.secureAccess')}</p>
            <h1>{t(appLanguage, 'shell.secureStorageTitle')}</h1>
            <p className="body">{t(appLanguage, 'shell.secureStorageCopy1')}</p>
            <p className="body">{t(appLanguage, 'shell.secureStorageCopy2')}</p>

            {selectionError ? (
              <div className="callout callout-error">
                <strong>{t(appLanguage, 'shell.secureSetupFailed')}</strong>
                <p>{selectionError}</p>
              </div>
            ) : null}

            <div className="tunnel-builder-actions">
              <button className="new-tab-button" onClick={() => void handleAcknowledgeKeychainAccessNotice()} type="button">
                {t(appLanguage, 'shell.secureStorageContinue')}
              </button>
            </div>
          </section>
        </main>
      </I18nProvider>
    )
  }

  return (
    <I18nProvider language={appLanguage}>
    <main className="workspace-layout terminal-theme">
      <WorkspaceRail
        currentWorkspace={currentWorkspace}
        hasActiveSession={activeTabId !== null}
        liveTabs={liveTabs}
        onSelectWorkspace={(workspace) => {
          runMotionSafeTransition(() => {
            setCurrentWorkspace(workspace)
            setActiveTabId(null)
          })
        }}
        onSelectTab={(tabId) => {
          setActiveTabId(tabId)
        }}
        onCloseTab={(tabId) => {
          void handleCloseTab(tabId)
        }}
      />

      <section className="main-shell">
        <div className="main-shell-body">
          <div className="workspace-main">
            <div className="workspace-canvas" data-workspace={activeTab ? 'session' : activeTunnelTab ? 'tunnel-session' : currentWorkspace}>
              {selectionError ? (
                <div className="callout callout-error inline-callout">
                  <strong>Action failed.</strong>
                  <p>{selectionError}</p>
                </div>
              ) : null}

              {ssmSessionPanels.map(({ session, isActive }) => (
                <div
                  key={session.id}
                  aria-hidden={!isActive}
                  className={isActive ? 'terminal-panel' : 'terminal-panel terminal-panel-hidden'}
                  data-session-panel={session.id}
                >
                  <div className="terminal-toolbar">
                    <span>{session.title}</span>
                    <div className="terminal-meta">
                      <span>{session.instanceId}</span>
                      <span>{session.status}</span>
                    </div>
                  </div>

                  {sessionErrors[session.id] ? (
                    <div className="callout callout-error">
                      <strong>Session error.</strong>
                      <p>{sessionErrors[session.id]}</p>
                    </div>
                  ) : null}

                  <SessionTerminal
                    sessionId={session.id}
                    isActive={isActive}
                    autoFocus
                    theme={appTheme}
                    uiScale={appUiScale}
                  />
                </div>
              ))}

              {!activeTab && activeTunnelTab ? (
            <div className="terminal-panel">
              <div className="terminal-toolbar">
                <span>
                  {t(appLanguage, 'shell.tunnelTabTitle', { name: activeTunnelTab.targetName })}
                </span>
                <div className="terminal-meta">
                  <span>localhost:{activeTunnelTab.localPort}</span>
                  <span>{activeTunnelTab.status}</span>
                </div>
              </div>

              {tunnelErrors[activeTunnelTab.id] ? (
                <div className="callout callout-error inline-callout">
                  <strong>{t(appLanguage, 'tunnels.errorTitle')}</strong>
                  <p>{tunnelErrors[activeTunnelTab.id]}</p>
                </div>
              ) : null}

              <div className="tunnel-status-panel">
                <div className="tunnel-summary-grid">
                  <div>
                    <span className="summary-label">{t(appLanguage, 'tunnels.summary.target')}</span>
                    <strong>{activeTunnelTab.targetName}</strong>
                    <p>
                      {activeTunnelTab.targetEndpoint}:{activeTunnelTab.remotePort}
                    </p>
                  </div>
                  <div>
                    <span className="summary-label">{t(appLanguage, 'tunnels.summary.jump')}</span>
                    <strong>{activeTunnelTab.jumpInstanceName}</strong>
                    <p>{activeTunnelTab.jumpInstanceId}</p>
                  </div>
                  <div>
                    <span className="summary-label">{t(appLanguage, 'tunnels.summary.forward')}</span>
                    <strong>localhost:{activeTunnelTab.localPort}</strong>
                    <p>
                      {activeTunnelTab.profileName} / {activeTunnelTab.region}
                    </p>
                  </div>
                </div>
                <pre className="tunnel-log">{tunnelLogRef.current[activeTunnelTab.id] ?? ''}</pre>
              </div>
            </div>
          ) : !activeTab && currentWorkspace === 'ec2-ssm-connect' ? (
            selectedProfile ? (
              (() => {
                const ec2State = getEc2WorkspaceState(selectedProfile.id)

                return (
                  <Ec2Workspace
                    activeProfileName={selectedProfile.name}
                    activeRegion={selectedProfile.region}
                    favoriteShortcutIdsByInstance={
                      new Map(
                        ec2State.instances
                          .map((instance) => [instance.id, favoriteShortcutIdsByInstance.get(`${selectedProfile.id}:${instance.id}`)])
                          .filter((entry): entry is [string, string] => Boolean(entry[1]))
                      )
                    }
                    instances={ec2State.instances}
                    instancesLoading={ec2State.loading}
                    instancesError={ec2State.error}
                    pendingInstanceId={ec2State.pendingInstanceId}
                    selectedInstanceId={ec2State.selectedInstanceId}
                    onRefresh={() => {
                      void refreshEc2Profile(selectedProfile.id)
                    }}
                    onSelectInstance={(instanceId) =>
                      runMotionSafeTransition(() =>
                        updateEc2WorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          selectedInstanceId: instanceId
                        }))
                      )
                    }
                    onOpenSession={(instance) => {
                      void handleOpenSession(selectedProfile, instance)
                    }}
                    onToggleFavorite={(instance, favoriteShortcutId) => {
                      if (favoriteShortcutId) {
                        void handleDeleteSavedShortcut(favoriteShortcutId)
                        return
                      }

                      void handleCreateSavedShortcut(buildSsmShortcutDraft('favorite', selectedProfile, instance, appLanguage), {
                        revealQuickAccess: false
                      })
                    }}
                  />
                )
              })()
            ) : null
          ) : !activeTab && currentWorkspace === 's3-browser' ? (
            selectedProfile ? (
              (() => {
                const s3State = getS3WorkspaceState(selectedProfile.id)

                return (
                  <S3Workspace
                    activeProfileName={selectedProfile.name}
                    activeRegion={selectedProfile.region}
                    buckets={s3State.buckets}
                    bucketsLoading={s3State.bucketsLoading}
                    bucketsError={s3State.bucketsError}
                    selectedBucketName={s3State.selectedBucketName}
                    currentPrefix={s3State.currentPrefix}
                    searchQuery={s3State.searchQuery}
                    objectList={s3State.objectList}
                    objectsLoading={s3State.objectsLoading}
                    objectsError={s3State.objectsError}
                    onRefreshBuckets={() => {
                      void refreshS3Buckets(selectedProfile.id)
                    }}
                    onRefreshObjects={() => {
                      void refreshS3Objects(selectedProfile.id)
                    }}
                    onSearchQueryChange={(value) => {
                      updateS3WorkspaceState(selectedProfile.id, (current) => ({
                        ...current,
                        searchQuery: value
                      }))
                    }}
                    onSearchSubmit={() => {
                      const nextState = getS3WorkspaceState(selectedProfile.id)
                      updateS3WorkspaceState(selectedProfile.id, (current) => ({
                        ...current,
                        submittedQuery: current.searchQuery
                      }))
                      void refreshS3Objects(selectedProfile.id, {
                        currentPrefix: nextState.currentPrefix,
                        submittedQuery: nextState.searchQuery
                      })
                    }}
                    onSelectBucket={(bucketName) => {
                      runMotionSafeTransition(() => {
                        updateS3WorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          selectedBucketName: bucketName,
                          currentPrefix: '',
                          searchQuery: '',
                          submittedQuery: '',
                          objectList: null,
                          objectsError: null
                        }))
                      })
                      void refreshS3Objects(selectedProfile.id, {
                        bucketName,
                        currentPrefix: '',
                        submittedQuery: ''
                      })
                    }}
                    onOpenPrefix={(prefix) => {
                      runMotionSafeTransition(() => {
                        updateS3WorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          currentPrefix: prefix,
                          objectList: null,
                          objectsError: null
                        }))
                      })
                      const nextState = getS3WorkspaceState(selectedProfile.id)
                      void refreshS3Objects(selectedProfile.id, {
                        currentPrefix: prefix,
                        submittedQuery: nextState.submittedQuery
                      })
                    }}
                    onSelectBreadcrumb={(prefix) => {
                      runMotionSafeTransition(() => {
                        updateS3WorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          currentPrefix: prefix,
                          objectList: null,
                          objectsError: null
                        }))
                      })
                      const nextState = getS3WorkspaceState(selectedProfile.id)
                      void refreshS3Objects(selectedProfile.id, {
                        currentPrefix: prefix,
                        submittedQuery: nextState.submittedQuery
                      })
                    }}
                  />
                )
              })()
            ) : null
          ) : !activeTab && currentWorkspace === 'aws-tunneling' ? (
            selectedProfile ? (
              (() => {
                const tunnelState = getTunnelWorkspaceState(selectedProfile.id)
                const tunnelActionState = resolveTunnelActionState({
                  tunnelDraft: tunnelState.tunnelDraft,
                  tunnelTargets: tunnelState.tunnelTargets,
                  jumpInstances: tunnelState.jumpInstances
                })
                const tunnelActionHint = tunnelActionState.issue
                  ? tunnelActionIssueMessage(appLanguage, tunnelActionState.issue)
                  : null

                return (
                  <TunnelWorkspace
                    activeProfileName={selectedProfile.name}
                    activeRegion={selectedProfile.region}
                    tunnelDraft={tunnelState.tunnelDraft}
                    tunnelTargets={tunnelState.tunnelTargets}
                    tunnelTargetsLoading={tunnelState.tunnelTargetsLoading}
                    tunnelTargetsError={tunnelState.tunnelTargetsError}
                    jumpInstances={tunnelState.jumpInstances}
                    jumpInstancesLoading={tunnelState.jumpInstancesLoading}
                    jumpInstancesError={tunnelState.jumpInstancesError}
                    actionHint={tunnelActionHint}
                    canOpenTunnel={tunnelActionState.issue === null}
                    canSaveShortcut={tunnelActionState.issue === null}
                    pendingTunnelOpen={tunnelState.pendingTunnelOpen}
                    onSelectTunnelKind={(kind) => {
                      runMotionSafeTransition(() => {
                        updateTunnelWorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          tunnelTargetsError: null,
                          tunnelTargetsLoading: true,
                          tunnelTargets: [],
                          tunnelDraft: {
                            ...current.tunnelDraft,
                            kind,
                            targetId: null,
                            jumpInstanceId: null,
                            localPort: ''
                          }
                        }))
                      })
                      void refreshTunnelTargets(selectedProfile.id, kind)
                    }}
                    onSelectTarget={(targetId) => {
                      runMotionSafeTransition(() => {
                        updateTunnelWorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          tunnelTargetsError: null,
                          tunnelDraft: {
                            ...current.tunnelDraft,
                            targetId,
                            jumpInstanceId: null,
                            localPort: ''
                          }
                        }))
                      })
                    }}
                    onSelectJumpHost={(instanceId) => {
                      runMotionSafeTransition(() => {
                        updateTunnelWorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          tunnelTargetsError: null,
                          tunnelDraft: { ...current.tunnelDraft, jumpInstanceId: instanceId }
                        }))
                      })
                    }}
                    onSelectLocalPort={(port) => {
                      runMotionSafeTransition(() => {
                        updateTunnelWorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          tunnelTargetsError: null,
                          tunnelDraft: { ...current.tunnelDraft, localPort: port }
                        }))
                      })
                    }}
                    onOpenTunnel={() => {
                      void handleOpenTunnel(selectedProfile)
                    }}
                    onSaveShortcut={() => {
                      if (tunnelActionState.issue) {
                        updateTunnelWorkspaceState(selectedProfile.id, (current) => ({
                          ...current,
                          tunnelTargetsError: tunnelActionIssueMessage(appLanguage, tunnelActionState.issue!)
                        }))
                        return
                      }

                      void handleCreateSavedShortcut(
                        buildTunnelShortcutDraft(
                          'preset',
                          selectedProfile,
                          tunnelActionState.selectedTarget,
                          tunnelActionState.selectedJumpHost,
                          String(tunnelActionState.localPort),
                          appLanguage
                        )
                      )
                    }}
                    onResetDraft={() => resetTunnelDraft(selectedProfile.id)}
                  />
                )
              })()
            ) : null
          ) : !activeTab && currentWorkspace === 'quick-access' ? (
            <QuickAccessDashboard
              quickAccess={quickAccess}
              onDeleteShortcut={(shortcutId) => {
                void handleDeleteSavedShortcut(shortcutId)
              }}
              onLaunchShortcut={(shortcutId) => {
                void handleLaunchShortcut(shortcutId)
              }}
            />
          ) : !activeTab && currentWorkspace === 'settings' ? (
            <SettingsDrawer
              language={appLanguage}
              theme={appTheme}
              uiScale={appUiScale}
              profiles={readiness.profiles}
              editingProfileId={editingProfileId}
              profileForm={profileForm}
              profileFormError={profileFormError}
              runtimeConfig={runtimePaths}
              runtimeFormError={runtimeFormError ?? missingDependencies}
              dependencyStatus={readiness.dependencyStatus}
              resetAppDataConfirmVisible={resetAppDataConfirmVisible}
              resetAppDataConfirmationText={resetAppDataConfirmationText}
              onChangeLanguage={(nextLanguage) => {
                void handleChangeLanguage(nextLanguage)
              }}
              onChangeTheme={(nextTheme) => {
                void handleChangeTheme(nextTheme)
              }}
              onChangeUiScale={(nextUiScale) => {
                void handleChangeUiScale(nextUiScale)
              }}
              onBeginEditProfile={(profile) => beginEditProfile(profile)}
              onDeleteProfile={(profileId) => {
                void handleDeleteProfile(profileId)
              }}
              onBeginCreateProfile={() => beginCreateProfile()}
              onUpdateProfileForm={(patch) => setProfileForm((current) => ({ ...current, ...patch }))}
              onSaveProfile={() => {
                void submitProfileForm()
              }}
              onUpdateRuntimeField={(field, value) =>
                setRuntimePaths((current) => ({
                  ...current,
                  [field]: value
                }))
              }
              onSaveRuntimePaths={() => {
                void handleSaveRuntimePaths()
              }}
              onUpdateResetText={(value) => {
                setResetAppDataConfirmVisible(value.length > 0)
                setResetAppDataConfirmationText(value)
              }}
              onResetAppData={() => {
                if (!resetAppDataConfirmVisible) {
                  beginResetAppData()
                  return
                }
                void handleResetAppData()
              }}
            />
          ) : !activeTab ? (
            <DashboardHome
              liveSessionCount={allTabs.length}
              onOpenEc2Workspace={() => setCurrentWorkspace('ec2-ssm-connect')}
              onOpenQuickAccess={() => setCurrentWorkspace('quick-access')}
              onOpenTunnelWorkspace={() => setCurrentWorkspace('aws-tunneling')}
              quickAccessCount={quickAccess.favorites.length + quickAccess.presets.length}
              recentCount={quickAccess.recents.length}
            />
          ) : null}
            </div>

            {
              <UtilityPanel
                profiles={readiness.profiles}
                selectedProfileId={selectedProfileId}
                liveItems={liveItems}
                notices={notices}
                onSelectProfile={(profileId) => {
                  void handleSelectProfile(profileId)
                }}
                onToastAction={handleNotificationAction}
                onToastDismiss={dismissNotification}
                toastItems={toastItems}
                workspace={activeTab ? 'session' : activeTunnelTab ? 'tunnel-session' : currentWorkspace}
              />
            }
          </div>
        </div>

        <div className="main-statusbar">
          <div className="status-group">
            <span className="sidebar-label">profiles</span>
            <strong>{readiness.profiles.length}</strong>
          </div>

          <div className="status-group status-controls">
            <span className="sidebar-label">{allTabs.length} live</span>
          </div>
        </div>

      </section>
    </main>
    </I18nProvider>
  )
}
