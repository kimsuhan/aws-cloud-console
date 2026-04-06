import { useId } from 'react'

import type { Ec2InstanceSummary, TunnelKind, TunnelTargetSummary } from '@shared/contracts'

import { EmptyStatePanel } from './components/EmptyStatePanel'
import { LoadingStatePanel } from './components/LoadingStatePanel'
import { WorkspaceStatusBadge } from './components/WorkspaceStatusBadge'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { useI18n } from './i18n'
import { useRadioGroupNavigation } from './radio-group'
type TunnelWorkspaceLayout = 'default' | 'grouped'

export interface TunnelDraftState {
  kind: TunnelKind | null
  targetId: string | null
  jumpInstanceId: string | null
  localPort: string
}

export type TunnelActionIssue =
  | 'missing-kind'
  | 'missing-target'
  | 'missing-jump'
  | 'missing-port'
  | 'invalid-port'
  | 'selection-unavailable'

export interface TunnelActionState {
  issue: TunnelActionIssue | null
  localPort: number | null
  selectedJumpHost: Ec2InstanceSummary | null
  selectedTarget: TunnelTargetSummary | null
}

type TunnelStepState = 'complete' | 'active' | 'blocked' | 'loading'

function resolveStepState({
  loading,
  complete,
  active,
  blocked
}: {
  loading: boolean
  complete: boolean
  active: boolean
  blocked: boolean
}): TunnelStepState {
  if (loading) {
    return 'loading'
  }

  if (complete) {
    return 'complete'
  }

  if (active) {
    return 'active'
  }

  if (blocked) {
    return 'blocked'
  }

  return 'active'
}

export function resolveTunnelActionState({
  tunnelDraft,
  tunnelTargets,
  jumpInstances
}: {
  tunnelDraft: TunnelDraftState
  tunnelTargets: TunnelTargetSummary[]
  jumpInstances: Ec2InstanceSummary[]
}): TunnelActionState {
  const selectedTarget = tunnelTargets.find((target) => target.id === tunnelDraft.targetId) ?? null
  const selectedJumpHost = jumpInstances.find((instance) => instance.id === tunnelDraft.jumpInstanceId) ?? null
  const normalizedLocalPort = tunnelDraft.localPort.trim()

  if (!tunnelDraft.kind) {
    return { issue: 'missing-kind', localPort: null, selectedJumpHost, selectedTarget }
  }

  if (!tunnelDraft.targetId) {
    return { issue: 'missing-target', localPort: null, selectedJumpHost, selectedTarget }
  }

  if (!tunnelDraft.jumpInstanceId) {
    return { issue: 'missing-jump', localPort: null, selectedJumpHost, selectedTarget }
  }

  if (!normalizedLocalPort) {
    return { issue: 'missing-port', localPort: null, selectedJumpHost, selectedTarget }
  }

  if (!selectedTarget || !selectedJumpHost) {
    return { issue: 'selection-unavailable', localPort: null, selectedJumpHost, selectedTarget }
  }

  const localPort = Number(normalizedLocalPort)
  if (!Number.isInteger(localPort) || localPort <= 0) {
    return { issue: 'invalid-port', localPort: null, selectedJumpHost, selectedTarget }
  }

  return {
    issue: null,
    localPort,
    selectedJumpHost,
    selectedTarget
  }
}

interface TunnelWorkspaceProps {
  activeProfileName: string
  activeRegion: string
  layout?: TunnelWorkspaceLayout
  tunnelDraft: TunnelDraftState
  tunnelTargets: TunnelTargetSummary[]
  tunnelTargetsLoading: boolean
  tunnelTargetsError: string | null
  jumpInstances: Ec2InstanceSummary[]
  jumpInstancesLoading: boolean
  jumpInstancesError: string | null
  actionHint: string | null
  canOpenTunnel: boolean
  canSaveShortcut: boolean
  pendingTunnelOpen: boolean
  onSelectTunnelKind: (kind: TunnelKind) => void
  onSelectTarget: (targetId: string) => void
  onSelectJumpHost: (instanceId: string) => void
  onSelectLocalPort: (port: string) => void
  onOpenTunnel: () => void
  onSaveShortcut: () => void
  onResetDraft: () => void
}

export function TunnelWorkspace({
  activeProfileName,
  activeRegion,
  layout = 'default',
  tunnelDraft,
  tunnelTargets,
  tunnelTargetsLoading,
  tunnelTargetsError,
  jumpInstances,
  jumpInstancesLoading,
  jumpInstancesError,
  actionHint,
  canOpenTunnel,
  canSaveShortcut,
  pendingTunnelOpen,
  onSelectTunnelKind,
  onSelectTarget,
  onSelectJumpHost,
  onSelectLocalPort,
  onOpenTunnel,
  onSaveShortcut,
  onResetDraft
}: TunnelWorkspaceProps): React.JSX.Element {
  const { t } = useI18n()
  const isGrouped = layout === 'grouped'
  const tunnelKindOptions: TunnelKind[] = ['db', 'redis']
  const selectedTarget = tunnelTargets.find((target) => target.id === tunnelDraft.targetId) ?? null
  const selectedJumpHost = jumpInstances.find((instance) => instance.id === tunnelDraft.jumpInstanceId) ?? null
  const actionHintId = useId()
  const canChooseJumpHost = selectedTarget !== null
  const canChooseLocalPort = selectedJumpHost !== null
  const showTunnelTargets = !tunnelTargetsLoading && tunnelTargets.length > 0
  const showJumpHosts = !jumpInstancesLoading && jumpInstances.length > 0
  const typeStepState = resolveStepState({
    loading: false,
    complete: tunnelDraft.kind !== null,
    active: tunnelDraft.kind === null,
    blocked: false
  })
  const targetStepState = resolveStepState({
    loading: tunnelTargetsLoading,
    complete: selectedTarget !== null,
    active: tunnelDraft.kind !== null && selectedTarget === null,
    blocked: tunnelDraft.kind === null
  })
  const jumpStepState = resolveStepState({
    loading: jumpInstancesLoading && canChooseJumpHost,
    complete: selectedJumpHost !== null,
    active: canChooseJumpHost && selectedJumpHost === null,
    blocked: !canChooseJumpHost
  })
  const portStepState = resolveStepState({
    loading: pendingTunnelOpen,
    complete: Boolean(tunnelDraft.localPort.trim()),
    active: canChooseLocalPort && !tunnelDraft.localPort.trim(),
    blocked: !canChooseLocalPort
  })
  const headerStatus = tunnelTargetsLoading || jumpInstancesLoading
    ? <WorkspaceStatusBadge label={t('tunnels.loadingTargets')} tone="loading" />
    : pendingTunnelOpen
      ? <WorkspaceStatusBadge label={t('tunnels.opening')} tone="mutating" />
      : <WorkspaceStatusBadge label={t('tunnels.guidance')} tone="ready" />
  const { getRadioProps } = useRadioGroupNavigation({
    onChange: onSelectTunnelKind,
    options: tunnelKindOptions,
    value: tunnelDraft.kind
  })

  return (
    <div className={isGrouped ? 'workspace-screen workspace-screen-grouped' : 'workspace-screen'}>
      {isGrouped ? (
        <div className="workspace-group-header">
          <div className="workspace-group-heading">
            <strong>{activeProfileName}</strong>
            <span>{activeRegion}</span>
            {headerStatus}
          </div>
          <button className="toolbar-button" onClick={onResetDraft} type="button">
            {t('common.reset')}
          </button>
        </div>
      ) : (
        <WorkspaceHeader
          context={
            <>
              <span className="workspace-badge">{activeProfileName}</span>
              <span className="workspace-badge">{activeRegion}</span>
              {headerStatus}
            </>
          }
          copy={t('tunnels.copy')}
          eyebrow={t('tunnels.title')}
          title={t('tunnels.title')}
        />
      )}

      <div className="tunnel-workspace-body">
        <div className="tunnel-profile-context">
          <span className="summary-label">{t('quickAccess.col.context')}</span>
          <div className="tunnel-profile-context-badges">
            <span className="workspace-badge">{activeProfileName}</span>
            <span className="workspace-badge">{activeRegion}</span>
          </div>
        </div>

        <div className="tunnel-draft-summary">
          <div className="tunnel-draft-summary-label">
            <span className="summary-label">{t('tunnels.draftSummary')}</span>
          </div>
          <div className="tunnel-draft-chip">{tunnelDraft.kind ?? t('tunnels.typeUnset')}</div>
          <div className="tunnel-draft-chip">{selectedTarget?.name ?? t('tunnels.targetUnset')}</div>
          <div className="tunnel-draft-chip">{selectedJumpHost?.name ?? t('tunnels.jumpUnset')}</div>
          <div className="tunnel-draft-chip">{tunnelDraft.localPort || t('tunnels.portUnset')}</div>
        </div>

        {tunnelTargetsError ? (
          <div className="callout callout-error inline-callout">
            <strong>{t('tunnels.setupFailed')}</strong>
            <p>{tunnelTargetsError}</p>
          </div>
        ) : null}

        {jumpInstancesError ? (
          <div className="callout callout-error inline-callout">
            <strong>{t('tunnels.jumpLookupFailed')}</strong>
            <p>{jumpInstancesError}</p>
          </div>
        ) : null}

        <div className="tunnel-workspace-grid">
          <div className="tunnel-builder">
            <div className="tunnel-builder-section" data-stage-state={typeStepState}>
              <span className="summary-label">{t('tunnels.step.type')}</span>
              <div
                aria-label={t('tunnels.step.type')}
                aria-orientation="horizontal"
                className="choice-row"
                role="radiogroup"
              >
                <button
                  aria-checked={tunnelDraft.kind === 'db'}
                  className={tunnelDraft.kind === 'db' ? 'choice-button active' : 'choice-button'}
                  {...getRadioProps('db', 0)}
                  onClick={() => onSelectTunnelKind('db')}
                  role="radio"
                  type="button"
                >
                  {t('tunnels.database')}
                </button>
                <button
                  aria-checked={tunnelDraft.kind === 'redis'}
                  className={tunnelDraft.kind === 'redis' ? 'choice-button active' : 'choice-button'}
                  {...getRadioProps('redis', 1)}
                  onClick={() => onSelectTunnelKind('redis')}
                  role="radio"
                  type="button"
                >
                  {t('tunnels.redis')}
                </button>
              </div>
            </div>

            <div className="tunnel-builder-section" data-stage-state={targetStepState}>
              <div className="tunnel-step-header">
                <span className="summary-label">{t('tunnels.step.target')}</span>
                <p className="tunnel-step-copy">{t('tunnels.step.targetCopy')}</p>
              </div>
              <div className="tunnel-target-list">
                {tunnelTargetsLoading ? (
                  <LoadingStatePanel
                    className="tunnel-loading-state"
                    copy={t('tunnels.step.targetCopy')}
                    title={t('tunnels.loadingTargets')}
                  />
                ) : null}
                {!tunnelTargetsLoading && tunnelTargets.length === 0 ? (
                  <EmptyStatePanel
                    className="tunnel-empty-state"
                    copy={t('tunnels.emptyTargetsCopy')}
                    title={t('tunnels.emptyTargetsTitle')}
                  />
                ) : null}
                {showTunnelTargets ? tunnelTargets.map((target) => (
                  <button
                    aria-pressed={tunnelDraft.targetId === target.id}
                    key={target.id}
                    className={tunnelDraft.targetId === target.id ? 'tunnel-target-row active' : 'tunnel-target-row'}
                    onClick={() => onSelectTarget(target.id)}
                    type="button"
                  >
                    <strong>{target.name}</strong>
                    <span>{target.engine}</span>
                    <span>
                      {target.endpoint}:{target.remotePort}
                    </span>
                    <span>{target.source}</span>
                  </button>
                )) : null}
              </div>
            </div>

            <div
              className={canChooseJumpHost ? 'tunnel-builder-section' : 'tunnel-builder-section tunnel-builder-section-blocked'}
              data-stage-state={jumpStepState}
            >
              <div className="tunnel-step-header">
                <span className="summary-label">{t('tunnels.step.jump')}</span>
                <p className="tunnel-step-copy">
                  {canChooseJumpHost ? t('tunnels.step.jumpCopy') : t('tunnels.step.jumpLocked')}
                </p>
              </div>
              {canChooseJumpHost ? (
                <div className="tunnel-target-list">
                  {jumpInstancesLoading ? (
                    <LoadingStatePanel
                      className="tunnel-loading-state"
                      copy={t('tunnels.step.jumpCopy')}
                      title={t('tunnels.loadingJumpHosts')}
                    />
                  ) : null}
                  {!jumpInstancesLoading && jumpInstances.length === 0 ? (
                    <EmptyStatePanel
                      className="tunnel-empty-state"
                      copy={t('tunnels.emptyJumpHostsCopy')}
                      title={t('tunnels.emptyJumpHosts')}
                    />
                  ) : null}
                  {showJumpHosts ? jumpInstances.map((instance) => (
                    <button
                      aria-pressed={tunnelDraft.jumpInstanceId === instance.id}
                      key={instance.id}
                      className={tunnelDraft.jumpInstanceId === instance.id ? 'tunnel-target-row active' : 'tunnel-target-row'}
                      onClick={() => onSelectJumpHost(instance.id)}
                      type="button"
                    >
                      <strong>{instance.name}</strong>
                      <span>{instance.id}</span>
                      <span>{instance.privateIpAddress ?? '-'}</span>
                    </button>
                  )) : null}
                </div>
              ) : (
                <EmptyStatePanel className="tunnel-empty-state" title={t('tunnels.step.jumpLocked')} />
              )}
            </div>

            <div
              className={canChooseLocalPort ? 'tunnel-builder-section' : 'tunnel-builder-section tunnel-builder-section-blocked'}
              data-stage-state={portStepState}
            >
              <div className="tunnel-step-header">
                <span className="summary-label">{t('tunnels.step.port')}</span>
                <p className="tunnel-step-copy">
                  {canChooseLocalPort ? t('tunnels.step.portCopy') : t('tunnels.step.portLocked')}
                </p>
              </div>
              {canChooseLocalPort ? (
                <div className="tunnel-port-selector">
                  <input
                    className="tunnel-input"
                    inputMode="numeric"
                    onChange={(event) => onSelectLocalPort(event.target.value)}
                    placeholder={t('tunnels.portPlaceholder')}
                    value={tunnelDraft.localPort}
                  />
                  <div className="choice-row">
                    <button className="toolbar-button" onClick={() => onSelectLocalPort('5432')} type="button">
                      5432
                    </button>
                    <button className="toolbar-button" onClick={() => onSelectLocalPort('15432')} type="button">
                      15432
                    </button>
                    <button className="toolbar-button" onClick={() => onSelectLocalPort('16379')} type="button">
                      16379
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyStatePanel className="tunnel-empty-state" title={t('tunnels.step.portLocked')} />
              )}
            </div>
          </div>

          <div className="utility-card tunnel-sidecar">
            <span className="summary-label">{t('tunnels.guidance')}</span>
            <strong>{selectedTarget?.name ?? t('tunnels.guidanceDefault')}</strong>
            <p className="tunnel-sidecar-context">
              {activeProfileName} · {activeRegion}
            </p>
            <p>{t('tunnels.guidanceCopy')}</p>
          </div>
        </div>

        <div className="tunnel-builder-actions tunnel-action-bar">
          <button
            aria-describedby={actionHint ? actionHintId : undefined}
            className="new-tab-button action-button-connect"
            disabled={pendingTunnelOpen || !canOpenTunnel}
            onClick={() => onOpenTunnel()}
            type="button"
          >
            {pendingTunnelOpen ? t('tunnels.opening') : t('tunnels.open')}
          </button>
          <button
            aria-describedby={actionHint ? actionHintId : undefined}
            className="toolbar-button action-button-save"
            disabled={!canSaveShortcut}
            onClick={() => onSaveShortcut()}
            type="button"
          >
            {t('common.save')}
          </button>
          <button className="toolbar-button" onClick={() => onResetDraft()} type="button">
            {t('tunnels.resetDraft')}
          </button>
          {actionHint ? (
            <p aria-live="polite" className="tunnel-action-hint" id={actionHintId} role="status">
              {actionHint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
