import test from 'node:test'
import assert from 'node:assert/strict'

import type { SessionTabState } from '@shared/contracts'

import { buildSsmSessionPanelStates } from './ssm-session-panel-state'

test('buildSsmSessionPanelStates keeps every session mounted while marking only the active tab', () => {
  const sessionTabs: SessionTabState[] = [
    {
      id: 'session-1',
      title: 'api',
      instanceId: 'i-1',
      instanceName: 'api',
      profileId: 'profile-1',
      profileName: 'prod',
      region: 'ap-northeast-2',
      status: 'open',
      openedAt: 1
    },
    {
      id: 'session-2',
      title: 'worker',
      instanceId: 'i-2',
      instanceName: 'worker',
      profileId: 'profile-1',
      profileName: 'prod',
      region: 'ap-northeast-2',
      status: 'open',
      openedAt: 2
    }
  ]

  const panelStates = buildSsmSessionPanelStates(sessionTabs, 'session-2')

  assert.deepEqual(
    panelStates.map((panel) => ({
      id: panel.session.id,
      isActive: panel.isActive
    })),
    [
      { id: 'session-1', isActive: false },
      { id: 'session-2', isActive: true }
    ]
  )
})
