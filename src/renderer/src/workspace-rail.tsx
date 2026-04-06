import type { ActionId } from '@shared/contracts'

import { useI18n } from './i18n'

type WorkspaceView = 'dashboard' | 'quick-access' | 'settings' | ActionId

interface WorkspaceRailProps {
  currentWorkspace: WorkspaceView
  hasActiveSession: boolean
  liveTabs: Array<{
    id: string
    title: string
    subtitle: string
    active: boolean
  }>
  onSelectWorkspace: (workspace: WorkspaceView) => void
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
}

const navigationItems: Array<{ id: WorkspaceView; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'quick-access', label: 'Quick Access' },
  { id: 'ec2-ssm-connect', label: 'EC2 Shells' },
  { id: 's3-browser', label: 'S3 Browser' },
  { id: 'aws-tunneling', label: 'Tunnels' },
  { id: 'settings', label: 'Settings' }
]

export function WorkspaceRail({
  currentWorkspace,
  hasActiveSession,
  liveTabs,
  onSelectWorkspace,
  onSelectTab,
  onCloseTab
}: WorkspaceRailProps): React.JSX.Element {
  const { t } = useI18n()
  const localizedItems = navigationItems.map((item) => ({
    ...item,
    label:
      item.id === 'dashboard'
        ? t('nav.dashboard')
        : item.id === 'quick-access'
          ? t('nav.quickAccess')
          : item.id === 'ec2-ssm-connect'
            ? t('nav.ec2Ssm')
            : item.id === 's3-browser'
              ? t('nav.s3')
            : item.id === 'aws-tunneling'
              ? t('nav.tunnels')
              : t('nav.settings')
  }))

  return (
    <aside className="sidebar-shell">
      <div className="workspace-rail">
        <div className="workspace-rail-brand">
          <strong>AWS Cloud Console</strong>
          <span>{t('rail.subtitle')}</span>
        </div>
        <nav aria-label={t('rail.workspaces')} className="workspace-nav" data-active-workspace={currentWorkspace}>
          <div className="workspace-rail-section-title">{t('rail.workspaces')}</div>
          {localizedItems.map((item) => (
            <button
              aria-current={currentWorkspace === item.id ? 'page' : undefined}
              key={item.id}
              className={
                currentWorkspace === item.id
                  ? hasActiveSession
                    ? 'workspace-nav-item active active-subdued'
                    : 'workspace-nav-item active'
                  : 'workspace-nav-item'
              }
              onClick={() => onSelectWorkspace(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-tabs">
          <div className="workspace-rail-section-title">{t('rail.activeSessions')}</div>
          {liveTabs.length === 0 ? (
            <div className="sidebar-empty">
              <span>{t('rail.noActiveSessions')}</span>
            </div>
          ) : (
            liveTabs.map((tab) => (
              <div
                key={tab.id}
                className={tab.active ? 'tab-row active' : 'tab-row'}
              >
                <button
                  aria-current={tab.active ? 'page' : undefined}
                  className="tab-row-button"
                  onClick={() => onSelectTab(tab.id)}
                  type="button"
                >
                  <div className="tab-row-copy">
                    <strong>{tab.title}</strong>
                    <span>{tab.subtitle}</span>
                  </div>
                </button>
                <button
                  aria-label={t('rail.closeSession', { title: tab.title })}
                  className="tab-close"
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                  type="button"
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
