import { Check, Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useI18n } from './i18n'
import type { AppNotification } from './notification-types'

interface NotificationCenterProps {
  items: AppNotification[]
  onAction: (id: string) => void
  onDismiss: (id: string) => void
}

interface NotificationToastProps {
  item: AppNotification
  onAction: (id: string) => void
  onDismiss: (id: string) => void
}

function NotificationGlyph({ tone }: { tone: AppNotification['tone'] }): React.JSX.Element {
  switch (tone) {
    case 'success':
      return <Check aria-hidden="true" className="notification-toast-glyph" strokeWidth={2.6} />
    case 'error':
      return <X aria-hidden="true" className="notification-toast-glyph" strokeWidth={2.6} />
    case 'info':
    default:
      return <Info aria-hidden="true" className="notification-toast-glyph" strokeWidth={2.4} />
  }
}

function NotificationToast({
  item,
  onAction,
  onDismiss
}: NotificationToastProps): React.JSX.Element {
  const { t } = useI18n()
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || !item.dismissAfterMs) {
      return
    }

    const timeout = window.setTimeout(() => {
      onDismiss(item.id)
    }, item.dismissAfterMs)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [item.dismissAfterMs, item.id, onDismiss, paused])

  return (
    <article
      className={`notification-toast notification-toast-${item.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
    >
      <div className="notification-toast-visual">
        <span aria-hidden="true" className={`notification-toast-glow notification-toast-glow-${item.tone}`} />
        <span className="notification-toast-icon-shell">
          <span className={`notification-toast-icon notification-toast-icon-${item.tone}`}>
            <NotificationGlyph tone={item.tone} />
          </span>
        </span>
      </div>
      <div className="notification-toast-content">
        <div className="notification-toast-header">
          <span className="notification-toast-eyebrow">{t(`notices.tone.${item.tone}`)}</span>
          <button
            aria-label={t('shell.dismiss')}
            className="notification-toast-close"
            onClick={() => onDismiss(item.id)}
            type="button"
          >
            x
          </button>
        </div>
        <p>{item.title}</p>
        {item.actionLabel ? (
          <div className="notification-toast-actions">
            <button className="toolbar-button toolbar-button-compact" onClick={() => onAction(item.id)} type="button">
              {item.actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

export function NotificationCenter({
  items,
  onAction,
  onDismiss
}: NotificationCenterProps): React.JSX.Element | null {
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const visibleItems = items.filter((item) => !dismissedIds.includes(item.id))

  useEffect(() => {
    setDismissedIds((current) => current.filter((id) => items.some((item) => item.id === id)))
  }, [items])

  if (visibleItems.length === 0) {
    return null
  }

  const dismissItem = (id: string) => {
    setDismissedIds((current) => (current.includes(id) ? current : [id, ...current].slice(0, 24)))
    onDismiss(id)
  }

  return (
    <div aria-live="polite" className="notification-center">
      {visibleItems.map((item, index) => (
        <div
          key={item.id}
          className="notification-center-item"
          style={{ ['--notification-index' as string]: String(index) }}
        >
          <NotificationToast item={item} onAction={onAction} onDismiss={dismissItem} />
        </div>
      ))}
    </div>
  )
}
