export type NotificationTone = 'success' | 'error' | 'info'

export interface AppNotification {
  id: string
  tone: NotificationTone
  title: string
  actionLabel?: string
  onAction?: () => void
  dismissAfterMs?: number
}
