import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AppProfileSummary, Ec2InstanceSummary, QuickAccessState, TunnelTargetSummary } from '@shared/contracts'

const activeProfile: AppProfileSummary = {
  id: 'profile-1',
  name: 'dev-admin',
  region: 'ap-northeast-2',
  createdAt: '2026-03-31T09:10:11.000Z',
  updatedAt: '2026-03-31T09:10:11.000Z',
  hasSessionToken: false,
  isDefault: true
}

const ec2Instance: Ec2InstanceSummary = {
  id: 'i-0123456789abcdef0',
  name: 'api-server',
  state: 'running',
  privateIpAddress: '10.0.0.10',
  availabilityZone: 'ap-northeast-2a'
}

const tunnelTarget: TunnelTargetSummary = {
  id: 'db-cluster:orders',
  kind: 'db',
  name: 'orders-db',
  engine: 'aurora-postgresql',
  endpoint: 'orders.cluster-abc.apne2.rds.amazonaws.com',
  remotePort: 5432,
  source: 'rds-cluster'
}

const quickAccess: QuickAccessState = {
  favorites: [
    {
      id: 'favorite-1',
      category: 'favorite',
      label: 'api shell',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0123456789abcdef0',
        instanceName: 'api-server'
      },
      createdAt: '2026-03-31T09:10:11.000Z',
      updatedAt: '2026-03-31T09:10:11.000Z'
    }
  ],
  presets: [
    {
      id: 'preset-1',
      category: 'preset',
      label: 'orders db tunnel',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'tunnel',
      payload: {
        targetId: 'db-cluster:orders',
        targetKind: 'db',
        targetName: 'orders-db',
        targetEndpoint: 'orders.cluster-abc.apne2.rds.amazonaws.com',
        remotePort: 5432,
        jumpInstanceId: 'i-0123456789abcdef0',
        jumpInstanceName: 'api-server',
        preferredLocalPort: 15432
      },
      createdAt: '2026-03-31T09:10:11.000Z',
      updatedAt: '2026-03-31T09:10:11.000Z'
    }
  ],
  recents: [
    {
      id: 'recent-1',
      label: 'worker shell',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0abcdef0123456789',
        instanceName: 'worker-server'
      },
      launchedAt: '2026-03-31T09:10:11.000Z'
    }
  ]
}

test('buildSsmShortcutDraft uses the active profile and instance details', async () => {
  const { buildSsmShortcutDraft } = await import('./quick-access')

  const draft = buildSsmShortcutDraft('favorite', activeProfile, ec2Instance)

  assert.deepEqual(draft, {
    category: 'favorite',
    label: 'api-server shell',
    profileId: 'profile-1',
    profileName: 'dev-admin',
    region: 'ap-northeast-2',
    launchKind: 'ssm',
    payload: {
      instanceId: 'i-0123456789abcdef0',
      instanceName: 'api-server'
    }
  })
})

test('buildTunnelShortcutDraft keeps the selected target, jump host, and preferred local port', async () => {
  const { buildTunnelShortcutDraft } = await import('./quick-access')

  const draft = buildTunnelShortcutDraft('preset', activeProfile, tunnelTarget, ec2Instance, '15432')

  assert.deepEqual(draft, {
    category: 'preset',
    label: 'orders-db tunnel',
    profileId: 'profile-1',
    profileName: 'dev-admin',
    region: 'ap-northeast-2',
    launchKind: 'tunnel',
    payload: {
      targetId: 'db-cluster:orders',
      targetKind: 'db',
      targetName: 'orders-db',
      targetEndpoint: 'orders.cluster-abc.apne2.rds.amazonaws.com',
      remotePort: 5432,
      jumpInstanceId: 'i-0123456789abcdef0',
      jumpInstanceName: 'api-server',
      preferredLocalPort: 15432
    }
  })
})

test('QuickAccessDashboard renders saved connections and a separate recent launches section', async () => {
  const { QuickAccessDashboard, toLauncherRows } = await import('./quick-access')

  const markup = renderToStaticMarkup(
    <QuickAccessDashboard
      quickAccess={quickAccess}
      onDeleteShortcut={() => {}}
      onLaunchShortcut={() => {}}
    />
  )

  assert.match(markup, /Quick Access/)
  assert.match(markup, /Saved Connections/)
  assert.match(markup, /Recent launches/)
  assert.match(markup, /Connection type/)
  assert.match(markup, /Target/)
  assert.match(markup, /Connection details/)
  assert.match(markup, /Available actions/)
  assert.match(markup, /class="quick-access-command-bar"/)
  assert.match(markup, /class="quick-access-scope"/)
  assert.match(markup, /class="[^"]*quick-access-table-shell[^"]*"/)
  assert.match(markup, /dev-admin · ap-northeast-2/)
  assert.match(markup, /api shell/)
  assert.match(markup, /orders db tunnel/)
  assert.match(markup, /worker shell/)
  assert.match(markup, /Shell/)
  assert.match(markup, /Tunnel/)
  assert.match(markup, /Open/)
  assert.match(markup, /Remove/)
  assert.doesNotMatch(markup, /role="radiogroup"/)
  assert.match(markup, /<table class="launcher-table-grid">/)
  assert.match(markup, /<thead>/)
  assert.match(markup, /<tbody>/)
  assert.match(markup, /responsive-cell-label[^>]*>Target</)
  assert.match(markup, /responsive-cell-label[^>]*>Available actions</)
  assert.doesNotMatch(markup, /PROFILE/)
  assert.doesNotMatch(markup, /dense launcher table/i)
})

test('toLauncherRows only includes shortcuts for the current profile', async () => {
  const { toLauncherRows } = await import('./quick-access')

  const rows = toLauncherRows(
    {
      ...quickAccess,
      favorites: [
        ...quickAccess.favorites,
        {
          id: 'favorite-2',
          category: 'favorite',
          label: 'other profile shell',
          profileId: 'profile-2',
          profileName: 'prod-admin',
          region: 'us-east-1',
          launchKind: 'ssm',
          payload: {
            instanceId: 'i-09999999999999999',
            instanceName: 'prod-api'
          },
          createdAt: '2026-03-31T09:10:11.000Z',
          updatedAt: '2026-03-31T09:10:11.000Z'
        }
      ]
    }
  )

  assert.deepEqual(rows.map((row) => row.label), ['api shell', 'other profile shell', 'orders db tunnel', 'worker shell'])
})

test('toLauncherRows keeps saved records ahead of recents', async () => {
  const { toLauncherRows } = await import('./quick-access')

  const rows = toLauncherRows(quickAccess)

  assert.deepEqual(rows.map((row) => row.category), ['favorite', 'preset', 'recent'])
})

test('QuickAccessDashboard caps the initial render for large shortcut lists', async () => {
  const { QuickAccessDashboard } = await import('./quick-access')

  const largeQuickAccess: QuickAccessState = {
    favorites: Array.from({ length: 45 }, (_, index) => ({
      id: `favorite-${index + 1}`,
      category: 'favorite' as const,
      label: `favorite shell ${index + 1}`,
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm' as const,
      payload: {
        instanceId: `i-${String(index + 1).padStart(17, '0')}`,
        instanceName: `instance-${index + 1}`
      },
      createdAt: '2026-03-31T09:10:11.000Z',
      updatedAt: '2026-03-31T09:10:11.000Z'
    })),
    presets: [],
    recents: []
  }

  const markup = renderToStaticMarkup(
    <QuickAccessDashboard
      quickAccess={largeQuickAccess}
      onDeleteShortcut={() => {}}
      onLaunchShortcut={() => {}}
    />
  )

  assert.equal((markup.match(/class="launcher-row"/g) ?? []).length, 40)
  assert.match(markup, /Show 5 more/)
  assert.doesNotMatch(markup, /favorite shell 45/)
})

test('QuickAccessDashboard limits the recent launches section to the latest three items', async () => {
  const { QuickAccessDashboard } = await import('./quick-access')

  const markup = renderToStaticMarkup(
    <QuickAccessDashboard
      quickAccess={{
        ...quickAccess,
        recents: Array.from({ length: 5 }, (_, index) => ({
          id: `recent-${index + 1}`,
          label: `recent shell ${index + 1}`,
          profileId: 'profile-1',
          profileName: 'dev-admin',
          region: 'ap-northeast-2',
          launchKind: 'ssm' as const,
          payload: {
            instanceId: `i-${String(index + 1).padStart(17, '0')}`,
            instanceName: `recent-instance-${index + 1}`
          },
          launchedAt: `2026-03-3${index}T09:10:11.000Z`
        }))
      }}
      onDeleteShortcut={() => {}}
      onLaunchShortcut={() => {}}
    />
  )

  assert.match(markup, /recent shell 1/)
  assert.match(markup, /recent shell 2/)
  assert.match(markup, /recent shell 3/)
  assert.doesNotMatch(markup, /recent shell 4/)
  assert.doesNotMatch(markup, /recent shell 5/)
})
