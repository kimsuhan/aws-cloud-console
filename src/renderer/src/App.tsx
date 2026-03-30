import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  ActionId,
  AppReadinessState,
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
  TunnelTargetSummary
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

function missingDependencyMessage(readiness: AppReadinessState): string | null {
  const missing: string[] = []

  if (!readiness.dependencyStatus.awsCliInstalled) {
    missing.push('aws CLI')
  }

  if (!readiness.dependencyStatus.sessionManagerPluginInstalled) {
    missing.push('session-manager-plugin')
  }

  return missing.length > 0 ? `${missing.join(' and ')} not found.` : null
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

  useEffect(() => {
    let cancelled = false

    void window.electronAPI.getAppReadiness().then(
      (nextReadiness) => {
        if (cancelled) {
          return
        }

        setReadiness(nextReadiness)
        setLoading(false)
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
  }, [readiness?.activeProfile?.profileName, readiness?.activeProfile?.region, selectedAction])

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
  }, [readiness?.activeProfile?.profileName, readiness?.activeProfile?.region, selectedAction, tunnelDraft.kind])

  useEffect(() => {
    if (selectedAction !== 'aws-tunneling') {
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
  }, [selectedAction])

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

  function resetTunnelBuilder(): void {
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

  async function handleProfileSelection(profileName: string): Promise<void> {
    setSelectionError(null)

    try {
      const activeProfile = await window.electronAPI.selectAwsProfile(profileName)
      setReadiness((current) =>
        current
          ? {
              ...current,
              activeProfile
            }
          : null
      )
      setSelectedAction(null)
      setActiveTabId(null)
      setSessionTabs([])
      setTunnelTabs([])
      sessionHistoryRef.current = {}
      tunnelLogRef.current = {}
      setSessionErrors({})
      setTunnelErrors({})
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : String(error))
    }
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
    resetTunnelBuilder()
  }

  async function handleRegionChange(region: string): Promise<void> {
    try {
      const nextProfile = await window.electronAPI.setActiveRegion(region)
      setReadiness((current) =>
        current
          ? {
              ...current,
              activeProfile: nextProfile
            }
          : current
      )
      setSelectedAction('ec2-ssm-connect')
      setActiveTabId(null)
    } catch (error) {
      setInstancesError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleResetProfile(): Promise<void> {
    await window.electronAPI.resetActiveProfile()
    setReadiness((current) =>
      current
        ? {
            ...current,
            activeProfile: null
          }
        : current
    )
    setSelectedAction(null)
    setActiveTabId(null)
    setSessionTabs([])
    setTunnelTabs([])
    setSessionErrors({})
    setTunnelErrors({})
    setInstances([])
    setInstancesError(null)
    sessionHistoryRef.current = {}
    tunnelLogRef.current = {}
    setNewTabMenuOpen(false)
    resetTunnelBuilder()
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
      resetTunnelBuilder()
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
      resetTunnelBuilder()
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

  if (!readiness.activeProfile) {
    return (
      <main className="gate-layout">
        <section className="gate-card">
          <p className="eyebrow">Profile Gate</p>
          <h1>Select an AWS profile</h1>
          <p className="body">
            The app reads profiles from <code>~/.aws/credentials</code> and resolves the region from
            <code> ~/.aws/config</code>.
          </p>

          {missingDependencies ? (
            <div className="callout callout-error">
              <strong>Missing local dependency.</strong>
              <p>{missingDependencies} Install both tools before opening EC2 SSM sessions.</p>
            </div>
          ) : null}

          {selectionError ? (
            <div className="callout callout-error">
              <strong>Profile setup failed.</strong>
              <p>{selectionError}</p>
            </div>
          ) : null}

          <div className="profile-list">
            {readiness.profiles.length === 0 ? (
              <div className="empty-card">
                <strong>No profiles found.</strong>
                <p>Add entries to <code>~/.aws/credentials</code> and restart the app.</p>
              </div>
            ) : (
              readiness.profiles.map((profile) => (
                <button
                  key={profile.name}
                  className="profile-button"
                  disabled={Boolean(missingDependencies)}
                  onClick={() => {
                    void handleProfileSelection(profile.name)
                  }}
                  type="button"
                >
                  {profile.name}
                </button>
              ))
            )}
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
          {activeTab ? (
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
                  <p>{activeTunnelTab.profileName} / {activeTunnelTab.region}</p>
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
                <span>{readiness.activeProfile.profileName}</span>
                <span>{readiness.activeProfile.region}</span>
              </span>
            </div>

            {tunnelTargetsError ? (
              <div className="callout callout-error inline-callout">
                <strong>Tunneling setup failed.</strong>
                <p>{tunnelTargetsError}</p>
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
            <strong>{readiness.activeProfile.profileName}</strong>
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
                void handleResetProfile()
              }}
              type="button"
            >
              switch profile
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
