import type { ActionId, AppProfileSummary } from '@shared/contracts'

import { EmptyStatePanel } from './components/EmptyStatePanel'
import { useIncrementalList } from './incremental-list'
import { useI18n } from './i18n'
import { NotificationCenter } from './notification-center'
import type { AppNotification } from './notification-types'
import { findRegionOption } from './region-catalog'

const INITIAL_UTILITY_ROWS = 12

type WorkspaceView = 'dashboard' | 'quick-access' | 'settings' | 'session' | 'tunnel-session' | ActionId

export interface UtilityPanelLiveItem {
  id: string
  label: string
  meta: string
  status: string
}

export interface UtilityPanelNotice {
  id: AppNotification['id']
  tone: AppNotification['tone']
  title: AppNotification['title']
}

interface UtilityPanelProps {
  profiles: AppProfileSummary[]
  selectedProfileId: string | null
  liveItems: UtilityPanelLiveItem[]
  notices: UtilityPanelNotice[]
  toastItems?: AppNotification[]
  onToastAction?: (id: string) => void
  onToastDismiss?: (id: string) => void
  onSelectProfile?: (profileId: string) => void
  workspace: WorkspaceView
}

export function UtilityPanel({
  profiles,
  selectedProfileId,
  liveItems,
  notices,
  toastItems = [],
  onToastAction = () => {},
  onToastDismiss = () => {},
  onSelectProfile = () => {},
  workspace
}: UtilityPanelProps): React.JSX.Element {
  const { t } = useI18n()
  const resolveRegionLabel = (region: string): string => {
    const option = findRegionOption(region)
    return option ? `${option.group} · ${option.city}` : region
  }
  const liveSessionList = useIncrementalList({
    items: liveItems,
    pageSize: INITIAL_UTILITY_ROWS,
    resetKey: `live:${liveItems.length}`
  })
  const noticeList = useIncrementalList({
    items: notices,
    pageSize: INITIAL_UTILITY_ROWS,
    resetKey: `notices:${notices.length}`
  })

  return (
    <aside className="utility-panel" data-workspace={workspace}>
      <section className="utility-card utility-card-profiles">
        <span className="summary-label">{t('shell.appProfiles')}</span>
        <div className="utility-profile-list">
          {profiles.map((profile) => (
            <button
              aria-pressed={selectedProfileId === profile.id}
              className={selectedProfileId === profile.id ? 'utility-profile-button active' : 'utility-profile-button'}
              key={profile.id}
              onClick={() => onSelectProfile(profile.id)}
              type="button"
            >
              <strong>{profile.name}</strong>
              <span>{resolveRegionLabel(profile.region)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="utility-card utility-card-live">
        <span className="summary-label">{t('notices.status')}</span>
        <div className="utility-list">
          {liveItems.length === 0 ? (
            <EmptyStatePanel
              className="utility-empty-state"
              copy={t('notices.noLiveCopy')}
              title={t('notices.noLiveTitle')}
            />
          ) : null}
          {liveSessionList.visibleItems.map((item) => (
            <div key={item.id} className="utility-list-row">
              <div>
                <strong>{item.label}</strong>
                <span>{item.meta}</span>
              </div>
              <span className="workspace-badge">{item.status.replace('-', ' ')}</span>
            </div>
          ))}
          {liveSessionList.hasMore ? (
            <div className="incremental-list-footer incremental-list-footer-compact">
              <span>{t('common.showingCount', { visible: liveSessionList.visibleCount, total: liveItems.length })}</span>
              <button className="toolbar-button" onClick={liveSessionList.showMore} type="button">
                {t('common.showMoreCount', {
                  count: Math.min(INITIAL_UTILITY_ROWS, liveSessionList.remainingCount)
                })}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="utility-card utility-card-notices">
        <span className="summary-label">{t('notices.history')}</span>
        <div className="utility-list">
          {notices.length === 0 ? (
            <EmptyStatePanel
              className="utility-empty-state"
              copy={t('notices.noneCopy')}
              title={t('notices.noneTitle')}
            />
          ) : null}
          {noticeList.visibleItems.map((notice) => (
            <div key={notice.id} className={`utility-notice utility-notice-${notice.tone}`}>
              <span className="utility-notice-tone">{t(`notices.tone.${notice.tone}`)}</span>
              <p>{notice.title}</p>
            </div>
          ))}
          {noticeList.hasMore ? (
            <div className="incremental-list-footer incremental-list-footer-compact">
              <span>{t('common.showingCount', { visible: noticeList.visibleCount, total: notices.length })}</span>
              <button className="toolbar-button" onClick={noticeList.showMore} type="button">
                {t('common.showMoreCount', {
                  count: Math.min(INITIAL_UTILITY_ROWS, noticeList.remainingCount)
                })}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <NotificationCenter items={toastItems} onAction={onToastAction} onDismiss={onToastDismiss} />
    </aside>
  )
}
