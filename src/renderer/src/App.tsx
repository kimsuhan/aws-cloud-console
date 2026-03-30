import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  ActionId,
  AppProfileSummary,
  AppReadinessState,
  CreateProfileRequest,
  Ec2InstanceSummary,
  OpenTunnelSessionRequest,
  SessionErrorEvent,
  SessionExitEvent,
  SessionOutputEvent,
  SessionTabState,
  TunnelErrorEvent,
  TunnelExitEvent,
  TunnelKind,
  TunnelLogEvent,
  TunnelSessionState,
  TunnelTargetSummary,
  UpdateProfileRequest,
  UpdateRuntimePathsRequest
} from '@shared/contracts'

import { SessionTerminal } from './components/SessionTerminal'

const regionOptions = [
  'ap-northeast-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'us-east-1',
  'us-west-2',
  'eu-west-1'
]

const actionDefinitions: Array<{ id: ActionId; label: string; description: string }> = [
  {
    id: 'ec2-ssm-connect',
    label: 'EC2 SSM Connect',
    description: 'List EC2 instances for the selected profile and open SSM shell tabs.'
  },
  {
    id: 'aws-tunneling',
    label: 'AWS Tunneling',
    description: 'Port-forward DB or Redis targets through an SSM jump instance.'
  }
]

interface TunnelDraftState {
  kind: TunnelKind | null
  targetId: string | null
  jumpInstanceId: string | null
  localPort: string
}

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

function emptyProfileForm(region = 'ap-northeast-2'): ProfileFormState {
  return {
    name: '',
    region,
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: ''
  }
}

function missingDependencyMessage(readiness: AppReadinessState): string | null {
  const missing: string[] = []

  if (!readiness.dependencyStatus.awsCli.installed) {
    missing.push('aws CLI')
  }

  if (!readiness.dependencyStatus.sessionManagerPlugin.installed) {
    missing.push('session-manager-plugin')
  }

  return missing.length > 0 ? `${missing.join(' and ')} not found.` : null
}

function dependencyCaption(label: string, installed: boolean, resolvedPath: string | null, source: string): string {
  if (!installed) {
    return `${label} is missing.`
  }

  return `${label} resolved from ${source}: ${resolvedPath}`
}

export function App(): React.JSX.Element {
  const [readiness, setReadiness] = useState<AppReadinessState | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sessionTabs, setSessionTabs] = useState<SessionTabState[]>([])
  const [tunnelTabs, setTunnelTabs] = useState<TunnelSessionState[]>([])
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({})
  const [tunnelErrors, setTunnelErrors] = useState<Record<string, string>>({})
  const [instances, setInstances] = useState<Ec2InstanceSummary[]>([])
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [instancesError, setInstancesError] = useState<string | null>(null)
  const [pendingInstanceId, setPendingInstanceId] = useState<string | null>(null)
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const sessionHistoryRef = useRef<Record<string, string>>({})
  const tunnelLogRef = useRef<Record<string, string>>({})
  const [tunnelTargets, setTunnelTargets] = useState<TunnelTargetSummary[]>([])
  const [tunnelTargetsLoading, setTunnelTargetsLoading] = useState(false)
  const [tunnelTargetsError, setTunnelTargetsError] = useState<string | null>(null)
  const [jumpInstances, setJumpInstances] = useState<Ec2InstanceSummary[]>([])
  const [jumpInstancesLoading, setJumpInstancesLoading] = useState(false)
  const [jumpInstancesError, setJumpInstancesError] = useState<string | null>(null)
  const [pendingTunnelOpen, setPendingTunnelOpen] = useState(false)
  const [tunnelDraft, setTunnelDraft] = useState<TunnelDraftState>({
    kind: null,
    targetId: null,
    jumpInstanceId: null,
    localPort: ''
  })
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm())
  const [runtimePaths, setRuntimePaths] = useState<RuntimePathFormState>({
    awsCliPath: '',
    sessionManagerPluginPath: ''
  })
  const [profileFormError, setProfileFormError] = useState<string | null>(null)
  const [runtimeFormError, setRuntimeFormError] = useState<string | null>(null)
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [profileManagerOpen, setProfileManagerOpen] = useState(false)

  async function refreshReadiness(): Promise<void> {
    const nextReadiness = await window.electronAPI.getAppReadiness()
    setReadiness(nextReadiness)
    setRuntimePaths({
      awsCliPath: nextReadiness.runtimeConfig.awsCliPath ?? '',
      sessionManagerPluginPath: nextReadiness.runtimeConfig.sessionManagerPluginPath ?? ''
    })
  }

  function resetWorkspaceState(): void {
    setSelectedAction(null)
    setActiveTabId(null)
    setSessionTabs([])
    setTunnelTabs([])
    setSessionErrors({})
    setTunnelErrors({})
    setInstances([])
    setInstancesError(null)
    setPendingInstanceId(null)
    setNewTabMenuOpen(false)
    sessionHistoryRef.current = {}
    tunnelLogRef.current = {}
    setTunnelTargets([])
    setTunnelTargetsError(null)
    setJumpInstances([])
    setJumpInstancesError(null)
    setPendingTunnelOpen(false)
    setTunnelDraft({
      kind: null,
      targetId: null,
      jumpInstanceId: null,
      localPort: ''
    })
  }

  useEffect(() => {
    let cancelled = false

    void refreshReadiness().then(
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
    if (!readiness?.activeProfile) {
      return
    }

    setProfileForm((current) =>
      editingProfileId
        ? current
        : {
            ...current,
            region: readiness.activeProfile?.region ?? current.region
          }
    )
  }, [editingProfileId, readiness?.activeProfile?.region])

  useEffect(() => {
    const unsubscribeOutput = window.electronAPI.onSessionOutput((event: SessionOutputEvent) => {
      sessionHistoryRef.current[event.sessionId] = `${sessionHistoryRef.current[event.sessionId] ?? ''}${event.data}`
    })

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

      setTunnelTabs((current) =>
        current.map((tab) => (tab.id === event.sessionId ? { ...tab, status: 'error' } : tab))
      )
    })

    return () => {
      unsubscribeOutput()
      unsubscribeExit()
      unsubscribeError()
      unsubscribeTunnelLog()
      unsubscribeTunnelExit()
      unsubscribeTunnelError()
    }
  }, [])

  useEffect(() => {
    if (!readiness?.activeProfile || selectedAction !== 'ec2-ssm-connect') {
      return
    }

    let cancelled = false
    setInstancesLoading(true)
    setInstancesError(null)

    void window.electronAPI.listEc2Instances().then(
      (nextInstances) => {
        if (cancelled) {
          return
        }

        setInstances(nextInstances)
        setInstancesLoading(false)
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }

        setInstancesError(error instanceof Error ? error.message : String(error))
        setInstancesLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [readiness?.activeProfile?.id, readiness?.activeProfile?.region, selectedAction])

  useEffect(() => {
    if (!readiness?.activeProfile || selectedAction !== 'aws-tunneling' || !tunnelDraft.kind) {
      return
    }

    let cancelled = false
    setTunnelTargetsLoading(true)
    setTunnelTargetsError(null)

    void window.electronAPI.listTunnelTargets(tunnelDraft.kind).then(
      (targets) => {
        if (cancelled) {
          return
        }

        setTunnelTargets(targets)
        setTunnelTargetsLoading(false)
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }

        setTunnelTargetsError(error instanceof Error ? error.message : String(error))
        setTunnelTargetsLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [readiness?.activeProfile?.id, readiness?.activeProfile?.region, selectedAction, tunnelDraft.kind])

  useEffect(() => {
    if (!readiness?.activeProfile || selectedAction !== 'aws-tunneling') {
      return
    }

    let cancelled = false
    setJumpInstancesLoading(true)
    setJumpInstancesError(null)

    void window.electronAPI.listEc2Instances().then(
      (nextInstances) => {
        if (cancelled) {
          return
        }

        setJumpInstances(nextInstances.filter((instance) => instance.state === 'running'))
        setJumpInstancesLoading(false)
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }

        setJumpInstancesError(error instanceof Error ? error.message : String(error))
        setJumpInstancesLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [readiness?.activeProfile?.id, selectedAction])

  const activeTab = useMemo(
    () => sessionTabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, sessionTabs]
  )
  const activeTunnelTab = useMemo(
    () => tunnelTabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tunnelTabs]
  )
  const allTabs = useMemo(() => [...sessionTabs, ...tunnelTabs], [sessionTabs, tunnelTabs])
  const runningInstances = useMemo(() => instances.filter((instance) => instance.state === 'running'), [instances])

  function beginCreateProfile(): void {
    setEditingProfileId(null)
    setProfileForm(emptyProfileForm(readiness?.activeProfile?.region ?? 'ap-northeast-2'))
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

      resetWorkspaceState()
      await refreshReadiness()
      beginCreateProfile()
      setProfileManagerOpen(false)
    } catch (error) {
      setProfileFormError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSelectProfile(profileId: string): Promise<void> {
    try {
      await window.electronAPI.selectActiveProfile(profileId)
      resetWorkspaceState()
      await refreshReadiness()
      setProfileManagerOpen(false)
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSetDefaultProfile(profileId: string): Promise<void> {
    try {
      await window.electronAPI.setDefaultProfile(profileId)
      resetWorkspaceState()
      await refreshReadiness()
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDeleteProfile(profileId: string): Promise<void> {
    if (!window.confirm('Delete this stored AWS profile?')) {
      return
    }

    try {
      await window.electronAPI.deleteProfile(profileId)
      resetWorkspaceState()
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
      resetWorkspaceState()
      await refreshReadiness()
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDismissLegacyImport(): Promise<void> {
    await window.electronAPI.dismissLegacyImport()
    await refreshReadiness()
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

    return `tunnel:${tab.targetKind}:${tab.targetName}`
  }

  function getSidebarTabSubtitle(tab: SessionTabState | TunnelSessionState): string {
    if ('instanceId' in tab) {
      return `${tab.instanceId} · ${tab.status}`
    }

    return `localhost:${tab.localPort} · ${tab.status}`
  }

  async function handleOpenSession(instance: Ec2InstanceSummary): Promise<void> {
    setPendingInstanceId(instance.id)

    try {
      const session = await window.electronAPI.openSsmSession({
        instanceId: instance.id,
        instanceName: instance.name
      })

      setSessionTabs((current) => [...current, { ...session, status: 'open' }])
      sessionHistoryRef.current[session.id] = sessionHistoryRef.current[session.id] ?? ''
      setActiveTabId(session.id)
      setNewTabMenuOpen(false)
    } catch (error) {
      setInstancesError(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingInstanceId(null)
    }
  }

  async function handleActionSelection(actionId: ActionId): Promise<void> {
    setSelectedAction(actionId)
    setActiveTabId(null)
    setNewTabMenuOpen(false)
    setTunnelTargets([])
    setTunnelTargetsError(null)
    setJumpInstancesError(null)
    setTunnelDraft({
      kind: null,
      targetId: null,
      jumpInstanceId: null,
      localPort: ''
    })
  }

  async function handleRegionChange(region: string): Promise<void> {
    if (!readiness?.activeProfile) {
      return
    }

    try {
      await window.electronAPI.updateProfile({
        id: readiness.activeProfile.id,
        name: readiness.activeProfile.name,
        region
      })
      resetWorkspaceState()
      await refreshReadiness()
      setSelectedAction('ec2-ssm-connect')
    } catch (error) {
      setInstancesError(error instanceof Error ? error.message : String(error))
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
        setSelectedAction(null)
      }
      return
    }

    await window.electronAPI.closeSession(sessionId)

    const remainingTabs = sessionTabs.filter((tab) => tab.id !== sessionId)
    setSessionTabs(remainingTabs)
    delete sessionHistoryRef.current[sessionId]
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

  async function handleOpenTunnel(): Promise<void> {
    if (!tunnelDraft.kind || !tunnelDraft.targetId || !tunnelDraft.jumpInstanceId || !tunnelDraft.localPort) {
      setTunnelTargetsError('Select tunnel type, target, jump instance, and local port.')
      return
    }

    const selectedTarget = tunnelTargets.find((target) => target.id === tunnelDraft.targetId)
    const jumpInstance = jumpInstances.find((instance) => instance.id === tunnelDraft.jumpInstanceId)

    if (!selectedTarget || !jumpInstance) {
      setTunnelTargetsError('Target or jump instance is no longer available.')
      return
    }

    const localPort = Number(tunnelDraft.localPort)
    if (!Number.isInteger(localPort) || localPort <= 0) {
      setTunnelTargetsError('Local port must be a valid positive integer.')
      return
    }

    setPendingTunnelOpen(true)
    setTunnelTargetsError(null)

    try {
      const request: OpenTunnelSessionRequest = {
        targetName: selectedTarget.name,
        targetKind: selectedTarget.kind,
        targetEndpoint: selectedTarget.endpoint,
        remotePort: selectedTarget.remotePort,
        localPort,
        jumpInstanceId: jumpInstance.id,
        jumpInstanceName: jumpInstance.name
      }
      const session = await window.electronAPI.openTunnelSession(request)

      setTunnelTabs((current) => [...current, session])
      tunnelLogRef.current[session.id] = ''
      setActiveTabId(session.id)
      setSelectedAction(null)
      setNewTabMenuOpen(false)
      setTunnelDraft({
        kind: null,
        targetId: null,
        jumpInstanceId: null,
        localPort: ''
      })
    } catch (error) {
      setTunnelTargetsError(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingTunnelOpen(false)
    }
  }

  if (loading || !readiness) {
    return <div className="state-screen terminal-theme">Initializing workspace...</div>
  }

  const missingDependencies = missingDependencyMessage(readiness)

  if (readiness.profiles.length === 0) {
    return (
      <main className="gate-layout">
        <section className="gate-card">
          <p className="eyebrow">App Profiles</p>
          <h1>Create your first AWS profile</h1>
          <p className="body">Store credentials inside the app and stop depending on local AWS config files.</p>

          {selectionError ? (
            <div className="callout callout-error">
              <strong>Profile setup failed.</strong>
              <p>{selectionError}</p>
            </div>
          ) : null}

          {profileFormError ? (
            <div className="callout callout-error">
              <strong>Profile validation failed.</strong>
              <p>{profileFormError}</p>
            </div>
          ) : null}

          <div className="profile-form">
            <input
              className="tunnel-input"
              onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="profile name"
              value={profileForm.name}
            />
            <select
              className="region-select"
              onChange={(event) => setProfileForm((current) => ({ ...current, region: event.target.value }))}
              value={profileForm.region}
            >
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <input
              className="tunnel-input"
              onChange={(event) => setProfileForm((current) => ({ ...current, accessKeyId: event.target.value }))}
              placeholder="access key id"
              value={profileForm.accessKeyId}
            />
            <input
              className="tunnel-input"
              onChange={(event) => setProfileForm((current) => ({ ...current, secretAccessKey: event.target.value }))}
              placeholder="secret access key"
              type="password"
              value={profileForm.secretAccessKey}
            />
            <input
              className="tunnel-input"
              onChange={(event) => setProfileForm((current) => ({ ...current, sessionToken: event.target.value }))}
              placeholder="optional session token"
              type="password"
              value={profileForm.sessionToken}
            />
          </div>

          <div className="tunnel-builder-actions">
            <button className="new-tab-button" onClick={() => void submitProfileForm()} type="button">
              [ Save Profile ]
            </button>
          </div>

          {readiness.canImportLegacyProfiles ? (
            <div className="callout">
              <strong>Legacy AWS files detected.</strong>
              <p>You can import profiles from <code>~/.aws</code> once, then manage them here.</p>
              <div className="tunnel-builder-actions">
                <button className="toolbar-button" onClick={() => void handleImportLegacyProfiles()} type="button">
                  import local profiles
                </button>
                <button className="toolbar-button" onClick={() => void handleDismissLegacyImport()} type="button">
                  skip import
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    )
  }

  if (!readiness.activeProfile) {
    return (
      <main className="gate-layout">
        <section className="gate-card">
          <p className="eyebrow">Profile Picker</p>
          <h1>Select an app-managed AWS profile</h1>

          {selectionError ? (
            <div className="callout callout-error">
              <strong>Profile selection failed.</strong>
              <p>{selectionError}</p>
            </div>
          ) : null}

          <div className="profile-list">
            {readiness.profiles.map((profile) => (
              <button
                key={profile.id}
                className="profile-button"
                onClick={() => void handleSelectProfile(profile.id)}
                type="button"
              >
                {profile.name}
              </button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  if (readiness.needsDependencySetup) {
    return (
      <main className="gate-layout">
        <section className="gate-card">
          <p className="eyebrow">Runtime Setup</p>
          <h1>Configure local AWS executables</h1>
          <p className="body">Packaged apps often miss your shell PATH, so the app resolves these binaries explicitly.</p>

          {missingDependencies ? (
            <div className="callout callout-error">
              <strong>Missing local dependency.</strong>
              <p>{missingDependencies}</p>
            </div>
          ) : null}

          {runtimeFormError ? (
            <div className="callout callout-error">
              <strong>Runtime path update failed.</strong>
              <p>{runtimeFormError}</p>
            </div>
          ) : null}

          <div className="profile-form">
            <div className="empty-card">
              <strong>aws CLI</strong>
              <p>
                {dependencyCaption(
                  'aws CLI',
                  readiness.dependencyStatus.awsCli.installed,
                  readiness.dependencyStatus.awsCli.resolvedPath,
                  readiness.dependencyStatus.awsCli.source
                )}
              </p>
            </div>
            <input
              className="tunnel-input"
              onChange={(event) => setRuntimePaths((current) => ({ ...current, awsCliPath: event.target.value }))}
              placeholder="/opt/homebrew/bin/aws"
              value={runtimePaths.awsCliPath}
            />
            <div className="empty-card">
              <strong>session-manager-plugin</strong>
              <p>
                {dependencyCaption(
                  'session-manager-plugin',
                  readiness.dependencyStatus.sessionManagerPlugin.installed,
                  readiness.dependencyStatus.sessionManagerPlugin.resolvedPath,
                  readiness.dependencyStatus.sessionManagerPlugin.source
                )}
              </p>
            </div>
            <input
              className="tunnel-input"
              onChange={(event) =>
                setRuntimePaths((current) => ({ ...current, sessionManagerPluginPath: event.target.value }))
              }
              placeholder="/opt/homebrew/bin/session-manager-plugin"
              value={runtimePaths.sessionManagerPluginPath}
            />
          </div>

          <div className="tunnel-builder-actions">
            <button className="new-tab-button" onClick={() => void handleSaveRuntimePaths()} type="button">
              [ Save Runtime Paths ]
            </button>
            <button className="toolbar-button" onClick={() => void refreshReadiness()} type="button">
              refresh detection
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="workspace-layout terminal-theme">
      <aside className="sidebar-shell">
        <div className="sidebar-tabs">
          {allTabs.length === 0 ? (
            <div className="sidebar-empty">
              <span>No open tabs</span>
            </div>
          ) : (
            allTabs.map((tab) => (
              <div
                key={tab.id}
                className={activeTabId === tab.id ? 'tab-row active' : 'tab-row'}
                onClick={() => setActiveTabId(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    setActiveTabId(tab.id)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="tab-row-copy">
                  <strong>{getSidebarTabTitle(tab)}</strong>
                  <span>{getSidebarTabSubtitle(tab)}</span>
                </div>
                <button
                  className="tab-close"
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleCloseTab(tab.id)
                  }}
                  type="button"
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          {newTabMenuOpen ? (
            <div className="new-tab-menu">
              {actionDefinitions.map((action) => (
                <button
                  key={action.id}
                  className="new-tab-option"
                  onClick={() => {
                    void handleActionSelection(action.id)
                  }}
                  type="button"
                >
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                </button>
              ))}
            </div>
          ) : null}
          <button
            className="new-tab-button"
            onClick={() => {
              setNewTabMenuOpen((current) => !current)
            }}
            type="button"
          >
            [ New Tab ]
          </button>
        </div>
      </aside>

      <section className="main-shell">
        <div className="main-shell-body">
          {selectionError ? (
            <div className="callout callout-error inline-callout">
              <strong>Action failed.</strong>
              <p>{selectionError}</p>
            </div>
          ) : null}

          {profileManagerOpen ? (
            <div className="action-shell">
              <div className="terminal-toolbar">
                <span>Profile Manager</span>
                <button className="toolbar-button" onClick={() => setProfileManagerOpen(false)} type="button">
                  close
                </button>
              </div>

              <div className="tunnel-builder">
                <div className="tunnel-builder-section">
                  <span className="summary-label">stored profiles</span>
                  <div className="tunnel-target-list">
                    {readiness.profiles.map((profile) => (
                      <div key={profile.id} className="tunnel-target-row">
                        <strong>{profile.name}</strong>
                        <span>{profile.region}</span>
                        <span>{profile.isDefault ? 'default' : 'secondary'}</span>
                        <span>{profile.id === readiness.activeProfile?.id ? 'active' : 'inactive'}</span>
                        <div className="tunnel-builder-actions">
                          <button className="toolbar-button" onClick={() => void handleSelectProfile(profile.id)} type="button">
                            use
                          </button>
                          <button className="toolbar-button" onClick={() => void handleSetDefaultProfile(profile.id)} type="button">
                            default
                          </button>
                          <button className="toolbar-button" onClick={() => beginEditProfile(profile)} type="button">
                            edit
                          </button>
                          <button className="toolbar-button" onClick={() => void handleDeleteProfile(profile.id)} type="button">
                            delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="tunnel-builder-section">
                  <span className="summary-label">{editingProfileId ? 'edit profile' : 'create profile'}</span>
                  {profileFormError ? (
                    <div className="callout callout-error inline-callout">
                      <strong>Profile update failed.</strong>
                      <p>{profileFormError}</p>
                    </div>
                  ) : null}
                  <div className="profile-form">
                    <input
                      className="tunnel-input"
                      onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="profile name"
                      value={profileForm.name}
                    />
                    <select
                      className="region-select"
                      onChange={(event) => setProfileForm((current) => ({ ...current, region: event.target.value }))}
                      value={profileForm.region}
                    >
                      {regionOptions.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                    <input
                      className="tunnel-input"
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, accessKeyId: event.target.value }))
                      }
                      placeholder={editingProfileId ? 'leave blank to keep access key' : 'access key id'}
                      value={profileForm.accessKeyId}
                    />
                    <input
                      className="tunnel-input"
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, secretAccessKey: event.target.value }))
                      }
                      placeholder={editingProfileId ? 'leave blank to keep secret key' : 'secret access key'}
                      type="password"
                      value={profileForm.secretAccessKey}
                    />
                    <input
                      className="tunnel-input"
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, sessionToken: event.target.value }))
                      }
                      placeholder={editingProfileId ? 'leave blank to keep session token' : 'optional session token'}
                      type="password"
                      value={profileForm.sessionToken}
                    />
                  </div>
                  <div className="tunnel-builder-actions">
                    <button className="new-tab-button" onClick={() => void submitProfileForm()} type="button">
                      {editingProfileId ? '[ Update Profile ]' : '[ Save Profile ]'}
                    </button>
                    <button className="toolbar-button" onClick={() => beginCreateProfile()} type="button">
                      new profile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab ? (
            <div className="terminal-panel">
              <div className="terminal-toolbar">
                <span>{activeTab.title}</span>
                <div className="terminal-meta">
                  <span>{activeTab.instanceId}</span>
                  <span>{activeTab.status}</span>
                </div>
              </div>

              {sessionErrors[activeTab.id] ? (
                <div className="callout callout-error">
                  <strong>Session error.</strong>
                  <p>{sessionErrors[activeTab.id]}</p>
                </div>
              ) : null}

              <SessionTerminal
                key={activeTab.id}
                sessionId={activeTab.id}
                initialBuffer={sessionHistoryRef.current[activeTab.id] ?? ''}
              />
            </div>
          ) : activeTunnelTab ? (
            <div className="terminal-panel">
              <div className="terminal-toolbar">
                <span>
                  tunnel:{activeTunnelTab.targetKind}:{activeTunnelTab.targetName}
                </span>
                <div className="terminal-meta">
                  <span>localhost:{activeTunnelTab.localPort}</span>
                  <span>{activeTunnelTab.status}</span>
                </div>
              </div>

              {tunnelErrors[activeTunnelTab.id] ? (
                <div className="callout callout-error inline-callout">
                  <strong>Tunnel error.</strong>
                  <p>{tunnelErrors[activeTunnelTab.id]}</p>
                </div>
              ) : null}

              <div className="tunnel-status-panel">
                <div className="tunnel-summary-grid">
                  <div>
                    <span className="summary-label">target</span>
                    <strong>{activeTunnelTab.targetName}</strong>
                    <p>
                      {activeTunnelTab.targetEndpoint}:{activeTunnelTab.remotePort}
                    </p>
                  </div>
                  <div>
                    <span className="summary-label">jump host</span>
                    <strong>{activeTunnelTab.jumpInstanceName}</strong>
                    <p>{activeTunnelTab.jumpInstanceId}</p>
                  </div>
                  <div>
                    <span className="summary-label">forward</span>
                    <strong>localhost:{activeTunnelTab.localPort}</strong>
                    <p>
                      {activeTunnelTab.profileName} / {activeTunnelTab.region}
                    </p>
                  </div>
                </div>
                <pre className="tunnel-log">{tunnelLogRef.current[activeTunnelTab.id] ?? ''}</pre>
              </div>
            </div>
          ) : selectedAction === 'ec2-ssm-connect' ? (
            <div className="action-shell">
              <div className="terminal-toolbar">
                <span>EC2 SSM Connect</span>
                <button
                  className="toolbar-button"
                  onClick={() => {
                    setInstancesLoading(true)
                    setInstancesError(null)
                    void window.electronAPI.listEc2Instances().then(
                      (nextInstances) => {
                        setInstances(nextInstances)
                        setInstancesLoading(false)
                      },
                      (error: unknown) => {
                        setInstancesError(error instanceof Error ? error.message : String(error))
                        setInstancesLoading(false)
                      }
                    )
                  }}
                  type="button"
                >
                  refresh
                </button>
              </div>

              {instancesError ? (
                <div className="callout callout-error inline-callout">
                  <strong>EC2 query failed.</strong>
                  <p>{instancesError}</p>
                </div>
              ) : null}

              <div className="instance-table">
                <div className="instance-table-header">
                  <span>name</span>
                  <span>instance id</span>
                  <span>private ip</span>
                </div>

                {instancesLoading ? <div className="table-placeholder">Loading EC2 instances...</div> : null}

                {!instancesLoading && runningInstances.length === 0 ? (
                  <div className="table-placeholder">No running EC2 instances available for this profile and region.</div>
                ) : null}

                {runningInstances.map((instance) => (
                  <button
                    key={instance.id}
                    className="instance-row"
                    disabled={pendingInstanceId === instance.id}
                    onClick={() => {
                      void handleOpenSession(instance)
                    }}
                    type="button"
                  >
                    <span>{instance.name}</span>
                    <span>{instance.id}</span>
                    <span>{instance.privateIpAddress ?? '-'}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : selectedAction === 'aws-tunneling' ? (
            <div className="action-shell">
              <div className="terminal-toolbar">
                <span>AWS Tunneling</span>
                <span className="terminal-meta">
                  <span>{readiness.activeProfile.name}</span>
                  <span>{readiness.activeProfile.region}</span>
                </span>
              </div>

              {tunnelTargetsError ? (
                <div className="callout callout-error inline-callout">
                  <strong>Tunneling setup failed.</strong>
                  <p>{tunnelTargetsError}</p>
                </div>
              ) : null}

              {jumpInstancesError ? (
                <div className="callout callout-error inline-callout">
                  <strong>Jump host lookup failed.</strong>
                  <p>{jumpInstancesError}</p>
                </div>
              ) : null}

              <div className="tunnel-builder">
                <div className="tunnel-builder-section">
                  <span className="summary-label">1. tunnel type</span>
                  <div className="choice-row">
                    <button
                      className={tunnelDraft.kind === 'db' ? 'choice-button active' : 'choice-button'}
                      onClick={() => setTunnelDraft((current) => ({ ...current, kind: 'db', targetId: null }))}
                      type="button"
                    >
                      database
                    </button>
                    <button
                      className={tunnelDraft.kind === 'redis' ? 'choice-button active' : 'choice-button'}
                      onClick={() => setTunnelDraft((current) => ({ ...current, kind: 'redis', targetId: null }))}
                      type="button"
                    >
                      redis
                    </button>
                  </div>
                </div>

                <div className="tunnel-builder-section">
                  <span className="summary-label">2. remote target</span>
                  <div className="tunnel-target-list">
                    {tunnelTargetsLoading ? <div className="table-placeholder">Loading tunnel targets...</div> : null}
                    {!tunnelTargetsLoading && tunnelTargets.length === 0 ? (
                      <div className="table-placeholder">Choose a tunnel type to load AWS targets.</div>
                    ) : null}
                    {tunnelTargets.map((target) => (
                      <button
                        key={target.id}
                        className={tunnelDraft.targetId === target.id ? 'tunnel-target-row active' : 'tunnel-target-row'}
                        onClick={() => setTunnelDraft((current) => ({ ...current, targetId: target.id }))}
                        type="button"
                      >
                        <strong>{target.name}</strong>
                        <span>{target.engine}</span>
                        <span>
                          {target.endpoint}:{target.remotePort}
                        </span>
                        <span>{target.source}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="tunnel-builder-section">
                  <span className="summary-label">3. jump instance</span>
                  <div className="tunnel-target-list">
                    {jumpInstancesLoading ? <div className="table-placeholder">Loading jump hosts...</div> : null}
                    {!jumpInstancesLoading && jumpInstances.length === 0 ? (
                      <div className="table-placeholder">No running jump instance candidates found.</div>
                    ) : null}
                    {jumpInstances.map((instance) => (
                      <button
                        key={instance.id}
                        className={
                          tunnelDraft.jumpInstanceId === instance.id ? 'tunnel-target-row active' : 'tunnel-target-row'
                        }
                        onClick={() => setTunnelDraft((current) => ({ ...current, jumpInstanceId: instance.id }))}
                        type="button"
                      >
                        <strong>{instance.name}</strong>
                        <span>{instance.id}</span>
                        <span>{instance.privateIpAddress ?? '-'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="tunnel-builder-section compact">
                  <span className="summary-label">4. local port</span>
                  <input
                    className="tunnel-input"
                    inputMode="numeric"
                    onChange={(event) => {
                      setTunnelDraft((current) => ({ ...current, localPort: event.target.value }))
                    }}
                    placeholder="e.g. 5432 / 6379 / 16379"
                    value={tunnelDraft.localPort}
                  />
                </div>

                <div className="tunnel-builder-actions">
                  <button className="new-tab-button" disabled={pendingTunnelOpen} onClick={() => void handleOpenTunnel()} type="button">
                    {pendingTunnelOpen ? '[ Opening Tunnel... ]' : '[ Open Tunnel ]'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="welcome-shell">
              <div className="welcome-copy">
                <h1>Open a new tab.</h1>
                <p>Use <code>[ New Tab ]</code> in the lower-left corner.</p>
              </div>
            </div>
          )}
        </div>

        <div className="main-statusbar">
          <div className="status-group">
            <span className="sidebar-label">profile</span>
            <strong>{readiness.activeProfile.name}</strong>
          </div>

          <div className="status-group status-controls">
            <select
              className="region-select"
              onChange={(event) => {
                void handleRegionChange(event.target.value)
              }}
              value={readiness.activeProfile.region}
            >
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <button
              className="profile-reset"
              onClick={() => {
                setProfileManagerOpen(true)
                beginCreateProfile()
              }}
              type="button"
            >
              manage profiles
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
