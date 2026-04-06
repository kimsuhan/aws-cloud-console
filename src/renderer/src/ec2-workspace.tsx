import type { Ec2InstanceSummary } from '@shared/contracts'

import { EmptyStatePanel } from './components/EmptyStatePanel'
import { LoadingStatePanel } from './components/LoadingStatePanel'
import { WorkspaceStatusBadge } from './components/WorkspaceStatusBadge'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { useIncrementalList } from './incremental-list'
import { useI18n } from './i18n'

const INITIAL_EC2_ROWS = 40
type Ec2WorkspaceLayout = 'default' | 'grouped'

interface Ec2WorkspaceProps {
  activeProfileName: string
  activeRegion: string
  layout?: Ec2WorkspaceLayout
  favoriteShortcutIdsByInstance: Map<string, string>
  instances: Ec2InstanceSummary[]
  instancesLoading: boolean
  instancesError: string | null
  pendingInstanceId: string | null
  selectedInstanceId: string | null
  onRefresh: () => void
  onSelectInstance: (instanceId: string) => void
  onOpenSession: (instance: Ec2InstanceSummary) => void
  onToggleFavorite: (instance: Ec2InstanceSummary, favoriteShortcutId: string | null) => void
}

export function Ec2Workspace({
  activeProfileName,
  activeRegion,
  layout = 'default',
  favoriteShortcutIdsByInstance,
  instances,
  instancesLoading,
  instancesError,
  pendingInstanceId,
  selectedInstanceId,
  onRefresh,
  onSelectInstance,
  onOpenSession,
  onToggleFavorite
}: Ec2WorkspaceProps): React.JSX.Element {
  const { t } = useI18n()
  const isGrouped = layout === 'grouped'
  const runningInstances = instances.filter((instance) => instance.state === 'running')
  const selectedInstanceIndex = selectedInstanceId
    ? runningInstances.findIndex((instance) => instance.id === selectedInstanceId)
    : -1
  const pendingInstanceIndex = pendingInstanceId ? runningInstances.findIndex((instance) => instance.id === pendingInstanceId) : -1
  const {
    visibleItems: visibleInstances,
    visibleCount,
    remainingCount,
    hasMore,
    showMore
  } = useIncrementalList({
    items: runningInstances,
    pageSize: INITIAL_EC2_ROWS,
    resetKey: `${activeProfileName}:${activeRegion}:${runningInstances.length}`,
    anchorIndices: [selectedInstanceIndex, pendingInstanceIndex]
  })
  const hasInstances = runningInstances.length > 0
  const headerStatus = instancesLoading
    ? <WorkspaceStatusBadge label={t('ec2.loading')} tone="loading" />
    : <WorkspaceStatusBadge label={t('ec2.ready')} tone="ready" />

  return (
    <div className={isGrouped ? 'workspace-screen workspace-screen-grouped' : 'workspace-screen'}>
      {isGrouped ? (
        <div className="workspace-group-header">
          <div className="workspace-group-heading">
            <strong>{activeProfileName}</strong>
            <span>{activeRegion}</span>
            <span>{t('ec2.runningInstances', { count: runningInstances.length })}</span>
            {headerStatus}
          </div>
          <button className="toolbar-button" onClick={onRefresh} type="button">
            {t('common.refresh')}
          </button>
        </div>
      ) : (
        <WorkspaceHeader
          actions={
            <button className="toolbar-button" onClick={onRefresh} type="button">
              {t('common.refresh')}
            </button>
          }
          context={
            <>
              <span className="workspace-badge">{activeProfileName}</span>
              <span className="workspace-badge">{activeRegion}</span>
              <span className="workspace-badge accent">{t('ec2.runningInstances', { count: runningInstances.length })}</span>
              {headerStatus}
            </>
          }
          copy={t('ec2.copy')}
          eyebrow={t('ec2.title')}
          title={t('ec2.title')}
        />
      )}

      {instancesError ? (
        <div className="callout callout-error inline-callout">
          <strong>{t('ec2.queryFailed')}</strong>
          <p>{instancesError}</p>
        </div>
      ) : null}

      <div className={hasInstances ? 'instance-table' : 'instance-table instance-table-empty'}>
        {instancesLoading ? (
          <LoadingStatePanel
            className="table-loading-state"
            copy={t('ec2.copy')}
            rows={4}
            title={t('ec2.loading')}
          />
        ) : null}
        {!instancesLoading && !hasInstances ? (
          <EmptyStatePanel
            className="table-empty-state"
            copy={t('ec2.emptyCopy')}
            title={t('ec2.emptyTitle')}
          />
        ) : null}

        {!instancesLoading && hasInstances ? (
          <table className="instance-table-grid">
            <thead>
              <tr className="instance-table-header">
                <th scope="col" aria-label={t('common.favorite')}>
                  <span aria-hidden="true">★</span>
                </th>
                <th scope="col">{t('quickAccess.col.target')}</th>
                <th scope="col">{t('quickAccess.col.details')}</th>
                <th scope="col">{t('quickAccess.col.context')}</th>
                <th scope="col">{t('quickAccess.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleInstances.map((instance) => {
                const favoriteShortcutId = favoriteShortcutIdsByInstance.get(instance.id) ?? null
                const isFavorite = favoriteShortcutId !== null

                return (
                  <tr
                    key={instance.id}
                    data-row-state={
                      pendingInstanceId === instance.id ? 'pending' : selectedInstanceId === instance.id ? 'selected' : 'idle'
                    }
                    className={selectedInstanceId === instance.id ? 'instance-row instance-row-selected' : 'instance-row'}
                  >
                    <td className="instance-cell instance-cell-favorite">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('common.favorite')}
                      </span>
                      <button
                        aria-label={isFavorite ? t('common.removeFavorite') : t('common.favorite')}
                        aria-pressed={isFavorite}
                        className={isFavorite ? 'favorite-toggle active action-button-favorite' : 'favorite-toggle action-button-favorite'}
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleFavorite(instance, favoriteShortcutId)
                        }}
                        type="button"
                      >
                        <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
                      </button>
                    </td>
                    <th className="instance-cell instance-cell-primary" scope="row">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('quickAccess.col.target')}
                      </span>
                      <button
                        aria-pressed={selectedInstanceId === instance.id}
                        className="instance-row-trigger"
                        onClick={() => onSelectInstance(instance.id)}
                        type="button"
                      >
                        <strong>{instance.name}</strong>
                      </button>
                    </th>
                    <td className="instance-cell instance-cell-id">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('quickAccess.col.details')}
                      </span>
                      <span>{instance.id}</span>
                      <span>{instance.privateIpAddress ?? '-'}</span>
                    </td>
                    <td className="instance-cell instance-cell-zone">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('quickAccess.col.context')}
                      </span>
                      <span>{activeProfileName}</span>
                      <span>
                        {activeRegion} · {instance.availabilityZone ?? '-'}
                      </span>
                    </td>
                  <td className="instance-cell instance-cell-actions">
                    <span aria-hidden="true" className="responsive-cell-label">
                      {t('quickAccess.col.actions')}
                    </span>
                    <div className="instance-row-actions">
                      <button
                        className="toolbar-button toolbar-button-compact action-button-connect"
                        disabled={pendingInstanceId === instance.id}
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenSession(instance)
                        }}
                        type="button"
                      >
                        {t('ec2.openShell')}
                      </button>
                    </div>
                  </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}

        {hasMore ? (
          <div className="incremental-list-footer">
            <span>{t('common.showingCount', { visible: visibleCount, total: runningInstances.length })}</span>
            <button className="toolbar-button" onClick={showMore} type="button">
              {t('common.showMoreCount', {
                count: Math.min(INITIAL_EC2_ROWS, remainingCount)
              })}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
