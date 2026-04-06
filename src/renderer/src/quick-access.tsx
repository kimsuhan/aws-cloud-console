import { useMemo, useState } from 'react'

import type {
  AppLanguage,
  AppProfileSummary,
  CreateSavedShortcutRequest,
  Ec2InstanceSummary,
  QuickAccessState,
  RecentLaunchRecord,
  SavedShortcutRecord,
  TunnelTargetSummary
} from '@shared/contracts'

import { EmptyStatePanel } from './components/EmptyStatePanel'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { useIncrementalList } from './incremental-list'
import { translate, useI18n } from './i18n'

interface QuickAccessDashboardProps {
  quickAccess: QuickAccessState
  onLaunchShortcut: (shortcutId: string) => void
  onDeleteShortcut: (shortcutId: string) => void
}

const INITIAL_QUICK_ACCESS_ROWS = 40
const RECENT_LAUNCH_LIMIT = 3

interface LauncherRow {
  id: string
  category: 'favorite' | 'preset' | 'recent'
  label: string
  launchKind: 'ssm' | 'tunnel'
  profileId: string
  profileName: string
  region: string
  summary: string
  meta: string
  deletable: boolean
}

type QuickAccessFilter = 'all' | 'favorite' | 'preset' | 'recent'

function launchKindLabel(launchKind: LauncherRow['launchKind'], translate: (key: string) => string): string {
  return translate(`quickAccess.launchKind.${launchKind}`)
}

function toSummary(record: SavedShortcutRecord | RecentLaunchRecord): string {
  if (record.launchKind === 'ssm') {
    return `${record.payload.instanceName} · ${record.payload.instanceId}`
  }

  return `${record.payload.targetName} · localhost:${record.payload.preferredLocalPort}`
}

function toMeta(record: SavedShortcutRecord | RecentLaunchRecord): string {
  if (record.launchKind === 'ssm') {
    return `${record.profileName} · ${record.region} · shell`
  }

  return `${record.profileName} · ${record.region} · tunnel`
}

export function toLauncherRows(quickAccess: QuickAccessState): LauncherRow[] {
  const favorites = quickAccess.favorites
    .map((record) => ({
    id: record.id,
    category: 'favorite' as const,
    label: record.label,
    launchKind: record.launchKind,
    profileId: record.profileId,
    profileName: record.profileName,
    region: record.region,
    summary: toSummary(record),
    meta: toMeta(record),
    deletable: true
  }))
  const presets = quickAccess.presets
    .map((record) => ({
    id: record.id,
    category: 'preset' as const,
    label: record.label,
    launchKind: record.launchKind,
    profileId: record.profileId,
    profileName: record.profileName,
    region: record.region,
    summary: toSummary(record),
    meta: toMeta(record),
    deletable: true
  }))
  const recents = quickAccess.recents
    .map((record) => ({
    id: record.id,
    category: 'recent' as const,
    label: record.label,
    launchKind: record.launchKind,
    profileId: record.profileId,
    profileName: record.profileName,
    region: record.region,
    summary: toSummary(record),
    meta: toMeta(record),
    deletable: false
  }))

  return [...favorites, ...presets, ...recents]
}

export function QuickAccessDashboard({
  quickAccess,
  onLaunchShortcut,
  onDeleteShortcut
}: QuickAccessDashboardProps): React.JSX.Element {
  const { t } = useI18n()
  const [activeFilter, setActiveFilter] = useState<QuickAccessFilter>('all')
  const rows = useMemo(() => toLauncherRows(quickAccess), [quickAccess])
  const favoriteRows = useMemo(() => rows.filter((row) => row.category === 'favorite'), [rows])
  const presetRows = useMemo(() => rows.filter((row) => row.category === 'preset'), [rows])
  const recentRows = useMemo(() => rows.filter((row) => row.category === 'recent').slice(0, RECENT_LAUNCH_LIMIT), [rows])
  const savedRows = useMemo(() => [...favoriteRows, ...presetRows], [favoriteRows, presetRows])
  const filteredRows = useMemo(() => {
    switch (activeFilter) {
      case 'favorite':
        return favoriteRows
      case 'preset':
        return presetRows
      case 'recent':
        return recentRows
      default:
        return savedRows
    }
  }, [activeFilter, favoriteRows, presetRows, recentRows, savedRows])
  const profileCount = useMemo(() => new Set(rows.map((row) => row.profileId)).size, [rows])
  const groupedRows = useMemo(() => {
    return filteredRows.reduce<Array<{ key: string; profileName: string; region: string; rows: LauncherRow[] }>>((groups, row) => {
      const key = `${row.profileId}:${row.region}`
      const existing = groups.find((group) => group.key === key)

      if (existing) {
        existing.rows.push(row)
        return groups
      }

      groups.push({
        key,
        profileName: row.profileName,
        region: row.region,
        rows: [row]
      })
      return groups
    }, [])
  }, [filteredRows])
  const showRecentSection = activeFilter === 'all'
  const quickAccessFilters: Array<{ key: QuickAccessFilter; label: string }> = [
    { key: 'all', label: t('quickAccess.filter.all') },
    { key: 'favorite', label: t('quickAccess.filter.favorite') },
    { key: 'preset', label: t('quickAccess.filter.preset') },
    { key: 'recent', label: t('quickAccess.filter.recent') }
  ]
  const {
    visibleItems: visibleRows,
    visibleCount,
    remainingCount,
    hasMore,
    showMore
  } = useIncrementalList({
    items: filteredRows,
    pageSize: INITIAL_QUICK_ACCESS_ROWS,
    resetKey: `${activeFilter}:${filteredRows.length}`
  })
  const hasRows = filteredRows.length > 0
  const visibleRowIds = useMemo(() => new Set(visibleRows.map((row) => row.id)), [visibleRows])
  const visibleGroups = useMemo(
    () =>
      groupedRows
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) => visibleRowIds.has(row.id))
        }))
        .filter((group) => group.rows.length > 0),
    [groupedRows, visibleRowIds]
  )

  return (
    <div className="workspace-screen quick-access-dashboard">
      <WorkspaceHeader
        copy={t('quickAccess.copy')}
        context={
          <>
          <span className="workspace-badge">{t('settings.profileCount', { count: profileCount })}</span>
          <span className="workspace-badge">{t('quickAccess.items', { count: savedRows.length })}</span>
          <span className="workspace-badge">{t('quickAccess.recentItems', { count: recentRows.length })}</span>
          </>
        }
        eyebrow={t('quickAccess.eyebrow')}
        title={t('quickAccess.title')}
      />

      <div className="quick-access-toolbar">
        <div className="quick-access-command-bar">
          <div className="quick-access-scope">
            <span className="summary-label">{t('quickAccess.scope')}</span>
            <strong>{t('settings.profileCount', { count: profileCount })}</strong>
            <p>{t('quickAccess.scopeCopy', { count: savedRows.length, recent: recentRows.length })}</p>
          </div>
          <div aria-label={t('quickAccess.filters')} className="workspace-filter-bar quick-access-filter-bar" role="toolbar">
            {quickAccessFilters.map((filter) => (
              <button
                aria-pressed={activeFilter === filter.key}
                className={activeFilter === filter.key ? 'workspace-filter-pill active' : 'workspace-filter-pill'}
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={hasRows ? 'launcher-table quick-access-table-shell' : 'launcher-table quick-access-table-shell launcher-table-empty'}
        data-active-filter={activeFilter}
      >
        {hasRows ? (
          <table className="launcher-table-grid">
            <thead>
              <tr className="launcher-table-header">
                <th scope="col">{t('quickAccess.col.type')}</th>
                <th scope="col">{t('quickAccess.col.target')}</th>
                <th scope="col">{t('quickAccess.col.details')}</th>
                <th scope="col">{t('quickAccess.col.context')}</th>
                <th scope="col">{t('quickAccess.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.flatMap((group) => [
                <tr key={`${group.key}-group`} className="launcher-group-row">
                  <th className="launcher-group-cell" colSpan={5} scope="colgroup">
                    {group.profileName} · {group.region}
                  </th>
                </tr>,
                ...group.rows.map((row) => (
                  <tr key={row.id} className="launcher-row">
                    <td className="launcher-cell launcher-cell-category">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('quickAccess.col.type')}
                      </span>
                      <span className={`workspace-badge workspace-badge-${row.launchKind}`}>{launchKindLabel(row.launchKind, t)}</span>
                    </td>
                    <th className="launcher-cell launcher-cell-primary" scope="row">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('quickAccess.col.target')}
                      </span>
                      <strong>{row.label}</strong>
                    </th>
                    <td className="launcher-cell launcher-cell-summary">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('quickAccess.col.details')}
                      </span>
                      <span>{row.summary}</span>
                    </td>
                    <td className="launcher-cell launcher-cell-context">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('quickAccess.col.context')}
                      </span>
                      <span>{row.meta}</span>
                    </td>
                    <td className="launcher-cell launcher-cell-actions">
                      <span aria-hidden="true" className="responsive-cell-label">
                        {t('quickAccess.col.actions')}
                      </span>
                      <div className="launcher-row-actions">
                        <button className="toolbar-button toolbar-button-compact" onClick={() => onLaunchShortcut(row.id)} type="button">
                          {t('quickAccess.open')}
                        </button>
                        {row.deletable ? (
                          <button
                            className="toolbar-button toolbar-button-compact"
                            onClick={() => onDeleteShortcut(row.id)}
                            type="button"
                          >
                            {t('quickAccess.remove')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ])}
            </tbody>
          </table>
        ) : (
          <EmptyStatePanel
            className="table-empty-state"
            copy={t('quickAccess.emptyCopy')}
            title={t('quickAccess.emptyTitle')}
          />
        )}

        {hasMore ? (
          <div className="incremental-list-footer">
            <span>{t('common.showingCount', { visible: visibleCount, total: filteredRows.length })}</span>
            <button className="toolbar-button" onClick={showMore} type="button">
              {t('common.showMoreCount', {
                count: Math.min(INITIAL_QUICK_ACCESS_ROWS, remainingCount)
              })}
            </button>
          </div>
        ) : null}
      </div>

      {showRecentSection ? (
        <section className="utility-card quick-access-recent-section">
          <div className="utility-panel-header">
            <span className="summary-label">{t('quickAccess.recentTitle')}</span>
            <p>{t('quickAccess.recentCopy')}</p>
          </div>
          <div className="utility-list">
            {recentRows.length === 0 ? (
              <EmptyStatePanel
                className="utility-empty-state"
                copy={t('quickAccess.recentEmptyCopy')}
                title={t('quickAccess.recentEmptyTitle')}
              />
            ) : null}
            {recentRows.map((row) => (
              <div key={row.id} className="utility-list-row">
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.summary}</span>
                  <span>{row.meta}</span>
                </div>
                <button className="toolbar-button toolbar-button-compact" onClick={() => onLaunchShortcut(row.id)} type="button">
                  {t('quickAccess.open')}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export function buildSsmShortcutDraft(
  category: CreateSavedShortcutRequest['category'],
  activeProfile: AppProfileSummary,
  instance: Ec2InstanceSummary,
  language: AppLanguage = 'en'
): CreateSavedShortcutRequest {
  return {
    category,
    label: translate(language, 'shortcuts.ssmLabel', { name: instance.name }),
    profileId: activeProfile.id,
    profileName: activeProfile.name,
    region: activeProfile.region,
    launchKind: 'ssm',
    payload: {
      instanceId: instance.id,
      instanceName: instance.name
    }
  }
}

export function buildTunnelShortcutDraft(
  category: CreateSavedShortcutRequest['category'],
  activeProfile: AppProfileSummary,
  target: TunnelTargetSummary,
  jumpInstance: Ec2InstanceSummary,
  localPort: string,
  language: AppLanguage = 'en'
): CreateSavedShortcutRequest {
  return {
    category,
    label: translate(language, 'shortcuts.tunnelLabel', { name: target.name }),
    profileId: activeProfile.id,
    profileName: activeProfile.name,
    region: activeProfile.region,
    launchKind: 'tunnel',
    payload: {
      targetId: target.id,
      targetKind: target.kind,
      targetName: target.name,
      targetEndpoint: target.endpoint,
      remotePort: target.remotePort,
      jumpInstanceId: jumpInstance.id,
      jumpInstanceName: jumpInstance.name,
      preferredLocalPort: Number(localPort)
    }
  }
}
