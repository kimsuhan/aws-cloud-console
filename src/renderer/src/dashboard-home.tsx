import { useI18n } from './i18n'

interface DashboardHomeProps {
  liveSessionCount: number
  quickAccessCount: number
  recentCount: number
  onOpenQuickAccess: () => void
  onOpenEc2Workspace: () => void
  onOpenTunnelWorkspace: () => void
}

export function DashboardHome({
  liveSessionCount,
  quickAccessCount,
  recentCount,
  onOpenQuickAccess,
  onOpenEc2Workspace,
  onOpenTunnelWorkspace
}: DashboardHomeProps): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="workspace-screen dashboard-home">
      <div className="dashboard-top-stack">
        <div className="workspace-screen-header">
          <div className="workspace-screen-heading">
            <span className="summary-label">{t('dashboard.eyebrow')}</span>
            <h1>{t('dashboard.title')}</h1>
            <p className="workspace-screen-copy">{t('dashboard.copy')}</p>
          </div>
          <div className="workspace-screen-badges">
            <span className="workspace-badge">{t('dashboard.online')}</span>
            <span className="workspace-badge accent">{t('dashboard.liveSessions', { count: liveSessionCount })}</span>
          </div>
        </div>

        <section className="dashboard-overview-strip" aria-label={t('dashboard.title')}>
          <div className="dashboard-overview-stat">
            <span className="summary-label">{t('dashboard.resumeWork')}</span>
            <strong>{t('dashboard.savedLaunchers', { count: quickAccessCount })}</strong>
            <p>{t('dashboard.resumeWorkCopy', { count: recentCount })}</p>
          </div>
          <div className="dashboard-overview-stat">
            <span className="summary-label">{t('dashboard.shellAccess')}</span>
            <strong>{t('dashboard.liveSessions', { count: liveSessionCount })}</strong>
            <p>{t('dashboard.activeStateCopy')}</p>
          </div>
          <div className="dashboard-overview-stat">
            <span className="summary-label">{t('dashboard.noticeStream')}</span>
            <strong>{t('dashboard.recentNotices', { count: recentCount })}</strong>
            <p>{t('dashboard.noticeCopy', { count: recentCount })}</p>
          </div>
        </section>
      </div>

      <div className="dashboard-section-heading">
        <span className="summary-label">{t('dashboard.primaryRoutes')}</span>
        <p>{t('dashboard.primaryRoutesCopy')}</p>
      </div>

      <div className="dashboard-primary-grid">
        <section className="dashboard-summary-card dashboard-summary-card-featured">
          <span className="summary-label">{t('dashboard.resumeWork')}</span>
          <strong>{t('dashboard.savedLaunchers', { count: quickAccessCount })}</strong>
          <p>{t('dashboard.resumeWorkCopy', { count: recentCount })}</p>
          <button className="toolbar-button dashboard-action" onClick={onOpenQuickAccess} type="button">
            {t('dashboard.openQuickAccess')}
          </button>
        </section>

        <div className="dashboard-action-stack">
          <section className="dashboard-summary-card dashboard-summary-card-secondary">
            <span className="summary-label">{t('dashboard.shellAccess')}</span>
            <strong>{t('dashboard.browseEc2Shells')}</strong>
            <p>{t('dashboard.shellAccessCopy')}</p>
            <button className="toolbar-button dashboard-action" onClick={onOpenEc2Workspace} type="button">
              {t('dashboard.browseEc2Shells')}
            </button>
          </section>

          <section className="dashboard-summary-card dashboard-summary-card-secondary">
            <span className="summary-label">{t('dashboard.connectionPaths')}</span>
            <strong>{t('dashboard.prepareTunnel')}</strong>
            <p>{t('dashboard.connectionPathsCopy')}</p>
            <button className="toolbar-button dashboard-action" onClick={onOpenTunnelWorkspace} type="button">
              {t('dashboard.prepareTunnel')}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
