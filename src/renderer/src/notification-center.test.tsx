import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('NotificationCenter renders overlay toasts with actions and dismiss controls', async () => {
  const { NotificationCenter } = await import('./notification-center')

  const markup = renderToStaticMarkup(
    <NotificationCenter
      items={[
        {
          id: 'notice-1',
          tone: 'success',
          title: 'Saved api shell to saved connections.',
          actionLabel: 'View saved connections'
        },
        {
          id: 'notice-2',
          tone: 'info',
          title: 'Opened tunnel for orders-db on localhost:15432.'
        }
      ]}
      onAction={() => {}}
      onDismiss={() => {}}
    />
  )

  assert.match(markup, /notification-center/)
  assert.equal((markup.match(/notification-toast-(success|info)/g) ?? []).length, 2)
  assert.equal((markup.match(/notification-toast-icon-shell/g) ?? []).length, 2)
  assert.equal((markup.match(/notification-toast-icon-(success|info)/g) ?? []).length, 2)
  assert.equal((markup.match(/notification-toast-glow-(success|info)/g) ?? []).length, 2)
  assert.match(markup, /View saved connections/)
  assert.match(markup, /Close notice/)
  assert.equal((markup.match(/role="status"/g) ?? []).length, 2)
})

test('NotificationCenter omits action buttons when a toast has no action', async () => {
  const { NotificationCenter } = await import('./notification-center')

  const markup = renderToStaticMarkup(
    <NotificationCenter
      items={[
        {
          id: 'notice-2',
          tone: 'error',
          title: 'Failed to save orders tunnel.'
        }
      ]}
      onAction={() => {}}
      onDismiss={() => {}}
    />
  )

  assert.doesNotMatch(markup, /View saved connections/)
  assert.match(markup, /Failed to save orders tunnel\./)
})
