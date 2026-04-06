import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('UtilityPanel renders profiles as a compact system list with readable region labels', async () => {
  const { UtilityPanel } = await import('./utility-panel')

  const markup = renderToStaticMarkup(
    <UtilityPanel
      workspace='dashboard'
      profiles={[
        { id: 'profile-1', name: 'dev', region: 'ap-northeast-2', createdAt: '', updatedAt: '', hasSessionToken: false, isDefault: true }
      ]}
      selectedProfileId='profile-1'
      liveItems={[
        { id: 'tunnel-1', label: 'orders-db', meta: 'localhost:15432', status: 'reconnecting' }
      ]}
      notices={[
        { id: 'notice-1', tone: 'success', title: 'Saved orders tunnel to saved connections' },
        { id: 'notice-2', tone: 'info', title: 'Preferred port busy, switched to 16432' }
      ]}
    />
  )

  assert.match(markup, /App Profiles/)
  assert.match(markup, /Asia Pacific · Seoul/)
  assert.match(markup, /Live sessions/)
  assert.match(markup, /Notification history/)
  assert.match(markup, /dev/)
  assert.match(markup, /orders-db/)
  assert.match(markup, /Saved orders tunnel to saved connections/)
  assert.match(markup, /Success/)
  assert.doesNotMatch(markup, /Operations Summary/)
  assert.doesNotMatch(markup, /Recommended actions/)
  assert.doesNotMatch(markup, /Reopen latest session/)
})

test('UtilityPanel renders notices as history rows instead of live status regions', async () => {
  const { UtilityPanel } = await import('./utility-panel')

  const markup = renderToStaticMarkup(
    <UtilityPanel
      workspace='dashboard'
      profiles={[
        { id: 'profile-1', name: 'dev', region: 'ap-northeast-2', createdAt: '', updatedAt: '', hasSessionToken: false, isDefault: true }
      ]}
      selectedProfileId='profile-1'
      liveItems={[]}
      notices={[
        { id: 'notice-1', tone: 'success', title: 'Saved orders tunnel to saved connections' },
        { id: 'notice-2', tone: 'error', title: 'Failed to save orders tunnel' }
      ]}
    />
  )

  assert.equal((markup.match(/class="utility-notice utility-notice-/g) ?? []).length, 2)
  assert.equal((markup.match(/role="status"/g) ?? []).length, 0)
  assert.equal((markup.match(/aria-live="polite"/g) ?? []).length, 0)
  assert.match(markup, /Error/)
})

test('UtilityPanel caps long live-session and notice lists on first render', async () => {
  const { UtilityPanel } = await import('./utility-panel')

  const markup = renderToStaticMarkup(
    <UtilityPanel
      workspace='dashboard'
      profiles={Array.from({ length: 2 }, (_, index) => ({
        id: `profile-${index + 1}`,
        name: `profile-${index + 1}`,
        region: 'ap-northeast-2',
        createdAt: '',
        updatedAt: '',
        hasSessionToken: false,
        isDefault: index === 0
      }))}
      selectedProfileId='profile-1'
      liveItems={Array.from({ length: 15 }, (_, index) => ({
        id: `session-${index + 1}`,
        label: `session-${index + 1}`,
        meta: `i-${index + 1}`,
        status: 'open'
      }))}
      notices={Array.from({ length: 14 }, (_, index) => ({
        id: `notice-${index + 1}`,
        tone: 'info' as const,
        title: `notice-${index + 1}`
      }))}
    />
  )

  assert.equal((markup.match(/class="utility-list-row"/g) ?? []).length, 12)
  assert.equal((markup.match(/class="utility-notice utility-notice-info"/g) ?? []).length, 12)
  assert.match(markup, /Show 3 more/)
  assert.match(markup, /Show 2 more/)
  assert.doesNotMatch(markup, /session-15/)
  assert.doesNotMatch(markup, /notice-14/)
})
