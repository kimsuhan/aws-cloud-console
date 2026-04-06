import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { Ec2InstanceSummary } from '@shared/contracts'

const instances: Ec2InstanceSummary[] = [
  {
    id: 'i-0123456789abcdef0',
    name: 'api-server',
    state: 'running',
    privateIpAddress: '10.0.0.10',
    availabilityZone: 'ap-northeast-2a'
  },
  {
    id: 'i-0abcdef0123456789',
    name: 'worker-server',
    state: 'running',
    privateIpAddress: '10.0.0.11',
    availabilityZone: 'ap-northeast-2b'
  }
]

test('Ec2Workspace renders a left-edge favorite column and no redundant shell type badge', async () => {
  const { Ec2Workspace } = await import('./ec2-workspace')

  const markup = renderToStaticMarkup(
    <Ec2Workspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      favoriteShortcutIdsByInstance={new Map([['i-0123456789abcdef0', 'favorite-1']])}
      instances={instances}
      instancesLoading={false}
      instancesError={null}
      pendingInstanceId={null}
      selectedInstanceId='i-0123456789abcdef0'
      onOpenSession={() => {}}
      onRefresh={() => {}}
      onSelectInstance={() => {}}
      onToggleFavorite={() => {}}
    />
  )

  assert.match(markup, /EC2 Shells/)
  assert.match(markup, /running instances/i)
  assert.match(markup, /Instance list ready/)
  assert.match(markup, /aria-label="Add to favorites"/)
  assert.match(markup, /<span aria-hidden="true">★<\/span>/)
  assert.match(markup, /Target/)
  assert.match(markup, /Connection details/)
  assert.match(markup, /Profile context/)
  assert.match(markup, /Available actions/)
  assert.match(markup, /api-server/)
  assert.match(markup, /worker-server/)
  assert.match(markup, /open shell/)
  assert.match(markup, /aria-label="Remove favorite"/)
  assert.match(markup, /aria-label="Add to favorites"/)
  assert.doesNotMatch(markup, />Save</)
  assert.doesNotMatch(markup, /workspace-badge workspace-badge-ssm/)
  assert.match(markup, /class="instance-row-trigger"/)
  assert.match(markup, /aria-pressed="true"/)
  assert.match(markup, /<table class="instance-table-grid">/)
  assert.match(markup, /<thead>/)
  assert.match(markup, /<tbody>/)
  assert.match(markup, /class="workspace-status-badge workspace-status-badge-ready"/)
  assert.match(markup, /data-row-state="selected" class="instance-row instance-row-selected"/)
  assert.match(markup, /class="favorite-toggle active action-button-favorite"/)
  assert.match(markup, /class="toolbar-button toolbar-button-compact action-button-connect"/)
  assert.match(markup, /responsive-cell-label[^>]*>Add to favorites</)
  assert.match(markup, /responsive-cell-label[^>]*>Connection details</)
  assert.match(markup, /responsive-cell-label[^>]*>Profile context</)
  assert.doesNotMatch(markup, /role="listbox"/)
  assert.doesNotMatch(markup, /role="option"/)
})

test('Ec2Workspace caps large instance lists while keeping the selected instance visible', async () => {
  const { Ec2Workspace } = await import('./ec2-workspace')

  const largeInstances: Ec2InstanceSummary[] = Array.from({ length: 45 }, (_, index) => ({
    id: `i-${String(index + 1).padStart(17, '0')}`,
    name: `instance-${index + 1}`,
    state: 'running',
    privateIpAddress: `10.0.0.${index + 10}`,
    availabilityZone: 'ap-northeast-2a'
  }))

  const selectedInstanceId = largeInstances[42]?.id ?? null

  const markup = renderToStaticMarkup(
    <Ec2Workspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      favoriteShortcutIdsByInstance={new Map()}
      instances={largeInstances}
      instancesLoading={false}
      instancesError={null}
      pendingInstanceId={null}
      selectedInstanceId={selectedInstanceId}
      onOpenSession={() => {}}
      onRefresh={() => {}}
      onSelectInstance={() => {}}
      onToggleFavorite={() => {}}
    />
  )

  assert.equal((markup.match(/class="instance-row(?: |")/g) ?? []).length, 43)
  assert.match(markup, /instance-43/)
  assert.match(markup, /Show 2 more/)
  assert.doesNotMatch(markup, /instance-45/)
})

test('Ec2Workspace hides stale rows while a refresh is in progress', async () => {
  const { Ec2Workspace } = await import('./ec2-workspace')

  const markup = renderToStaticMarkup(
    <Ec2Workspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      favoriteShortcutIdsByInstance={new Map()}
      instances={instances}
      instancesLoading={true}
      instancesError={null}
      pendingInstanceId={null}
      selectedInstanceId='i-0123456789abcdef0'
      onOpenSession={() => {}}
      onRefresh={() => {}}
      onSelectInstance={() => {}}
      onToggleFavorite={() => {}}
    />
  )

  assert.match(markup, /Loading EC2 instances/)
  assert.match(markup, /class="workspace-status-badge workspace-status-badge-loading"/)
  assert.match(markup, /class="loading-state-panel table-loading-state"/)
  assert.match(markup, /class="loading-skeleton-row"/)
  assert.doesNotMatch(markup, /api-server/)
  assert.doesNotMatch(markup, /worker-server/)
  assert.doesNotMatch(markup, /instance-row/)
})

test('Ec2Workspace grouped layout renders a compact profile section instead of the full workspace hero', async () => {
  const { Ec2Workspace } = await import('./ec2-workspace')

  const markup = renderToStaticMarkup(
    <Ec2Workspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      layout='grouped'
      favoriteShortcutIdsByInstance={new Map()}
      instances={instances}
      instancesLoading={false}
      instancesError={null}
      pendingInstanceId={null}
      selectedInstanceId={null}
      onOpenSession={() => {}}
      onRefresh={() => {}}
      onSelectInstance={() => {}}
      onToggleFavorite={() => {}}
    />
  )

  assert.match(markup, /class="workspace-group-header"/)
  assert.match(markup, /prod-admin/)
  assert.match(markup, /ap-northeast-2/)
  assert.doesNotMatch(markup, /<h1>EC2 Shells<\/h1>/)
})
