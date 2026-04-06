import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { Ec2InstanceSummary, TunnelTargetSummary } from '@shared/contracts'

const targets: TunnelTargetSummary[] = [
  {
    id: 'db-cluster:orders',
    kind: 'db',
    name: 'orders-db',
    engine: 'aurora-postgresql',
    endpoint: 'orders.cluster-abc.apne2.rds.amazonaws.com',
    remotePort: 5432,
    source: 'rds-cluster'
  }
]

const jumpHosts: Ec2InstanceSummary[] = [
  {
    id: 'i-0123456789abcdef0',
    name: 'orders-bastion',
    state: 'running',
    privateIpAddress: '10.0.0.20',
    availabilityZone: 'ap-northeast-2a'
  }
]

test('TunnelWorkspace renders current selections, staged selectors, and a single save action', async () => {
  const { TunnelWorkspace } = await import('./tunnel-workspace')

  const markup = renderToStaticMarkup(
    <TunnelWorkspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      tunnelDraft={{
        kind: 'db',
        targetId: 'db-cluster:orders',
        jumpInstanceId: 'i-0123456789abcdef0',
        localPort: '15432'
      }}
      tunnelTargets={targets}
      tunnelTargetsError={null}
      tunnelTargetsLoading={false}
      jumpInstances={jumpHosts}
      jumpInstancesError={null}
      jumpInstancesLoading={false}
      pendingTunnelOpen={false}
      actionHint={null}
      canOpenTunnel={true}
      canSaveShortcut={true}
      onOpenTunnel={() => {}}
      onResetDraft={() => {}}
      onSaveShortcut={() => {}}
      onSelectJumpHost={() => {}}
      onSelectLocalPort={() => {}}
      onSelectTarget={() => {}}
      onSelectTunnelKind={() => {}}
    />
  )

  assert.match(markup, /Tunnels/)
  assert.match(markup, /Current selections/)
  assert.match(markup, /remote target/i)
  assert.match(markup, /relay instance/i)
  assert.match(markup, /local port/i)
  assert.match(markup, /orders-db/)
  assert.match(markup, /orders-bastion/)
  assert.match(markup, /role="radiogroup"/)
  assert.match(markup, /aria-checked="true"[^>]*tabindex="0"[^>]*>Database/)
  assert.match(markup, /aria-checked="false"[^>]*tabindex="-1"[^>]*>Redis/)
  assert.match(markup, /aria-checked="true"[^>]*>Database/)
  assert.match(markup, /Start tunnel/)
  assert.match(markup, />Save</)
  assert.match(markup, /class="workspace-status-badge workspace-status-badge-ready"/)
  assert.match(markup, /class="tunnel-builder-section" data-stage-state="complete"/)
  assert.match(markup, /class="new-tab-button action-button-connect"/)
  assert.match(markup, /class="toolbar-button action-button-save"/)
  assert.doesNotMatch(markup, /Add to favorites/)
  assert.match(markup, /Clear selections/)
})

test('resolveTunnelActionState reports the first missing tunnel prerequisite', async () => {
  const { resolveTunnelActionState } = await import('./tunnel-workspace')

  assert.equal(
    resolveTunnelActionState({
      tunnelDraft: {
        kind: null,
        targetId: null,
        jumpInstanceId: null,
        localPort: ''
      },
      tunnelTargets: targets,
      jumpInstances: jumpHosts
    }).issue,
    'missing-kind'
  )

  assert.equal(
    resolveTunnelActionState({
      tunnelDraft: {
        kind: 'db',
        targetId: 'db-cluster:orders',
        jumpInstanceId: 'i-0123456789abcdef0',
        localPort: 'invalid'
      },
      tunnelTargets: targets,
      jumpInstances: jumpHosts
    }).issue,
    'invalid-port'
  )
})

test('TunnelWorkspace disables tunnel actions and exposes inline guidance when prerequisites are missing', async () => {
  const { TunnelWorkspace } = await import('./tunnel-workspace')

  const markup = renderToStaticMarkup(
    <TunnelWorkspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      tunnelDraft={{
        kind: 'db',
        targetId: null,
        jumpInstanceId: null,
        localPort: ''
      }}
      tunnelTargets={targets}
      tunnelTargetsError={null}
      tunnelTargetsLoading={false}
      jumpInstances={jumpHosts}
      jumpInstancesError={null}
      jumpInstancesLoading={false}
      pendingTunnelOpen={false}
      actionHint='Select a remote target to enable tunnel actions.'
      canOpenTunnel={false}
      canSaveShortcut={false}
      onOpenTunnel={() => {}}
      onResetDraft={() => {}}
      onSaveShortcut={() => {}}
      onSelectJumpHost={() => {}}
      onSelectLocalPort={() => {}}
      onSelectTarget={() => {}}
      onSelectTunnelKind={() => {}}
    />
  )

  assert.match(markup, /Select a remote target to enable tunnel actions\./)
  assert.match(markup, /disabled=""[^>]*>Start tunnel/)
  assert.match(markup, /disabled=""[^>]*>Save/)
  assert.match(markup, /data-stage-state="active"/)
  assert.match(markup, /data-stage-state="blocked"/)
  assert.doesNotMatch(markup, /Add to favorites/)
})

test('TunnelWorkspace defers jump-host and port controls until earlier steps are complete', async () => {
  const { TunnelWorkspace } = await import('./tunnel-workspace')

  const markup = renderToStaticMarkup(
    <TunnelWorkspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      tunnelDraft={{
        kind: 'db',
        targetId: null,
        jumpInstanceId: null,
        localPort: ''
      }}
      tunnelTargets={targets}
      tunnelTargetsError={null}
      tunnelTargetsLoading={false}
      jumpInstances={jumpHosts}
      jumpInstancesError={null}
      jumpInstancesLoading={false}
      pendingTunnelOpen={false}
      actionHint='Select a remote target to enable tunnel actions.'
      canOpenTunnel={false}
      canSaveShortcut={false}
      onOpenTunnel={() => {}}
      onResetDraft={() => {}}
      onSaveShortcut={() => {}}
      onSelectJumpHost={() => {}}
      onSelectLocalPort={() => {}}
      onSelectTarget={() => {}}
      onSelectTunnelKind={() => {}}
    />
  )

  assert.match(markup, /Select a remote target to choose a relay instance\./)
  assert.match(markup, /Select a relay instance to set the local port\./)
  assert.doesNotMatch(markup, /orders-bastion/)
  assert.doesNotMatch(markup, /placeholder="e\.g\. 5432 \/ 6379 \/ 16379"/)
})

test('TunnelWorkspace reveals relay instances before local port controls in the staged flow', async () => {
  const { TunnelWorkspace } = await import('./tunnel-workspace')

  const markup = renderToStaticMarkup(
    <TunnelWorkspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      tunnelDraft={{
        kind: 'db',
        targetId: 'db-cluster:orders',
        jumpInstanceId: null,
        localPort: ''
      }}
      tunnelTargets={targets}
      tunnelTargetsError={null}
      tunnelTargetsLoading={false}
      jumpInstances={jumpHosts}
      jumpInstancesError={null}
      jumpInstancesLoading={false}
      pendingTunnelOpen={false}
      actionHint='Select a relay instance to enable tunnel actions.'
      canOpenTunnel={false}
      canSaveShortcut={false}
      onOpenTunnel={() => {}}
      onResetDraft={() => {}}
      onSaveShortcut={() => {}}
      onSelectJumpHost={() => {}}
      onSelectLocalPort={() => {}}
      onSelectTarget={() => {}}
      onSelectTunnelKind={() => {}}
    />
  )

  assert.match(markup, /orders-bastion/)
  assert.match(markup, /Select a relay instance to set the local port\./)
  assert.doesNotMatch(markup, /placeholder="e\.g\. 5432 \/ 6379 \/ 16379"/)
})

test('TunnelWorkspace hides stale target rows while the selected connection type is loading', async () => {
  const { TunnelWorkspace } = await import('./tunnel-workspace')

  const markup = renderToStaticMarkup(
    <TunnelWorkspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      tunnelDraft={{
        kind: 'db',
        targetId: null,
        jumpInstanceId: null,
        localPort: ''
      }}
      tunnelTargets={targets}
      tunnelTargetsError={null}
      tunnelTargetsLoading={true}
      jumpInstances={jumpHosts}
      jumpInstancesError={null}
      jumpInstancesLoading={false}
      pendingTunnelOpen={false}
      actionHint={null}
      canOpenTunnel={false}
      canSaveShortcut={false}
      onOpenTunnel={() => {}}
      onResetDraft={() => {}}
      onSaveShortcut={() => {}}
      onSelectJumpHost={() => {}}
      onSelectLocalPort={() => {}}
      onSelectTarget={() => {}}
      onSelectTunnelKind={() => {}}
    />
  )

  assert.match(markup, /Loading tunnel targets/)
  assert.match(markup, /class="workspace-status-badge workspace-status-badge-loading"/)
  assert.match(markup, /class="loading-state-panel tunnel-loading-state"/)
  assert.match(markup, /class="loading-skeleton-row"/)
  assert.doesNotMatch(markup, /orders-db/)
  assert.doesNotMatch(markup, /tunnel-target-row/)
})

test('TunnelWorkspace hides stale relay rows while jump hosts are loading', async () => {
  const { TunnelWorkspace } = await import('./tunnel-workspace')

  const markup = renderToStaticMarkup(
    <TunnelWorkspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      tunnelDraft={{
        kind: 'db',
        targetId: 'db-cluster:orders',
        jumpInstanceId: null,
        localPort: ''
      }}
      tunnelTargets={targets}
      tunnelTargetsError={null}
      tunnelTargetsLoading={false}
      jumpInstances={jumpHosts}
      jumpInstancesError={null}
      jumpInstancesLoading={true}
      pendingTunnelOpen={false}
      actionHint={null}
      canOpenTunnel={false}
      canSaveShortcut={false}
      onOpenTunnel={() => {}}
      onResetDraft={() => {}}
      onSaveShortcut={() => {}}
      onSelectJumpHost={() => {}}
      onSelectLocalPort={() => {}}
      onSelectTarget={() => {}}
      onSelectTunnelKind={() => {}}
    />
  )

  assert.match(markup, /Loading relay instances/)
  assert.match(markup, /class="loading-state-panel tunnel-loading-state"/)
  assert.doesNotMatch(markup, /orders-bastion/)
})

test('TunnelWorkspace grouped layout renders a compact profile section instead of the full workspace hero', async () => {
  const { TunnelWorkspace } = await import('./tunnel-workspace')

  const markup = renderToStaticMarkup(
    <TunnelWorkspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      layout='grouped'
      tunnelDraft={{
        kind: null,
        targetId: null,
        jumpInstanceId: null,
        localPort: ''
      }}
      tunnelTargets={targets}
      tunnelTargetsError={null}
      tunnelTargetsLoading={false}
      jumpInstances={jumpHosts}
      jumpInstancesError={null}
      jumpInstancesLoading={false}
      pendingTunnelOpen={false}
      actionHint={null}
      canOpenTunnel={false}
      canSaveShortcut={false}
      onOpenTunnel={() => {}}
      onResetDraft={() => {}}
      onSaveShortcut={() => {}}
      onSelectJumpHost={() => {}}
      onSelectLocalPort={() => {}}
      onSelectTarget={() => {}}
      onSelectTunnelKind={() => {}}
    />
  )

  assert.match(markup, /class="workspace-group-header"/)
  assert.match(markup, /prod-admin/)
  assert.match(markup, /ap-northeast-2/)
  assert.match(markup, /Profile context/)
  assert.doesNotMatch(markup, /<h1>Tunnels<\/h1>/)
})
