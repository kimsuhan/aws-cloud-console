import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('WorkspaceRail renders management navigation and open tabs without redundant profile context', async () => {
  const { WorkspaceRail } = await import('./workspace-rail')

  const markup = renderToStaticMarkup(
    <WorkspaceRail
      currentWorkspace='dashboard'
      hasActiveSession
      liveTabs={[
        { id: 'session-1', title: 'api-shell', subtitle: 'i-0123 · open', active: true },
        { id: 'tunnel-1', title: 'orders-db', subtitle: 'localhost:15432 · open', active: false }
      ]}
      onSelectWorkspace={() => {}}
      onSelectTab={() => {}}
      onCloseTab={() => {}}
    />
  )

  assert.match(markup, /AWS Cloud Console/)
  assert.match(markup, /AWS access workspace/)
  assert.match(markup, /Workspaces/)
  assert.match(markup, /Dashboard/)
  assert.match(markup, /Quick Access/)
  assert.match(markup, /EC2 Shells/)
  assert.match(markup, /S3 Browser/)
  assert.match(markup, /Tunnels/)
  assert.match(markup, /Settings/)
  assert.match(markup, /workspace-nav-item active active-subdued/)
  assert.match(markup, /aria-current="page"[^>]*>Dashboard/)
  assert.match(markup, /Active Sessions/)
  assert.match(markup, /api-shell/)
  assert.doesNotMatch(markup, /prod-admin/)
})
