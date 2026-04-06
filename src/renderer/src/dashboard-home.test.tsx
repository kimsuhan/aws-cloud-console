import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('DashboardHome renders an actionable operations home instead of a coming soon placeholder', async () => {
  const { DashboardHome } = await import('./dashboard-home')

  const markup = renderToStaticMarkup(
    <DashboardHome
      quickAccessCount={8}
      recentCount={5}
      liveSessionCount={2}
      onOpenEc2Workspace={() => {}}
      onOpenQuickAccess={() => {}}
      onOpenTunnelWorkspace={() => {}}
    />
  )

  assert.match(markup, /Dashboard/)
  assert.match(markup, /Operations Overview/i)
  assert.match(markup, /Resume work/i)
  assert.match(markup, /Open Quick Access/i)
  assert.match(markup, /Browse EC2 Shells/i)
  assert.match(markup, /Prepare Tunnel/i)
  assert.match(markup, /2 live sessions/)
  assert.match(markup, /class="dashboard-overview-strip"/)
  assert.match(markup, /class="dashboard-overview-stat"/)
  assert.match(markup, /class="dashboard-section-heading"/)
  assert.match(markup, /class="dashboard-top-stack"/)
  assert.doesNotMatch(markup, /coming soon/i)
})
