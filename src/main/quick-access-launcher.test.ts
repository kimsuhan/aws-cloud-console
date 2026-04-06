import test from 'node:test'
import assert from 'node:assert/strict'

function createSavedShortcut(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shortcut-1',
    category: 'favorite',
    label: 'api shell',
    profileId: 'profile-2',
    profileName: 'prod-admin',
    region: 'ap-northeast-2',
    launchKind: 'ssm',
    payload: {
      instanceId: 'i-0123456789abcdef0',
      instanceName: 'api-server'
    },
    createdAt: '2026-03-31T09:10:11.000Z',
    updatedAt: '2026-03-31T09:10:11.000Z',
    ...overrides
  }
}

test('launchShortcut opens the SSM session for the shortcut profile without mutating global profile state', async () => {
  const { QuickAccessLauncher } = await import('./quick-access-launcher')
  const calls: string[] = []
  const recorded: unknown[] = []

  const launcher = new QuickAccessLauncher({
    quickAccessStore: {
      getSavedShortcut: async () => createSavedShortcut(),
      recordRecentLaunch: async (input: unknown) => {
        recorded.push(input)
      }
    },
    getExecutionContext: async (profileId: string) => ({
      profile: {
        id: profileId,
        name: 'prod-admin',
        region: 'ap-northeast-2'
      },
      awsCliPath: '/opt/homebrew/bin/aws',
      env: {
        AWS_REGION: 'ap-northeast-2',
        AWS_DEFAULT_REGION: 'ap-northeast-2'
      }
    }),
    listEc2Instances: async (profileId: string) => {
      calls.push(`instances:${profileId}`)
      return [
      {
        id: 'i-0123456789abcdef0',
        name: 'api-server',
        state: 'running',
        privateIpAddress: '10.0.0.10',
        availabilityZone: 'ap-northeast-2a'
      }
    ]},
    listTunnelTargets: async () => [],
    openSsmSession: async (input: unknown) => {
      calls.push(`ssm:${JSON.stringify(input)}`)
      return {
        id: 'session-1',
        title: 'api-server',
        instanceId: 'i-0123456789abcdef0',
        instanceName: 'api-server',
        profileId: 'profile-2',
        profileName: 'prod-admin',
        region: 'ap-northeast-2',
        status: 'open',
        openedAt: 1
      }
    },
    openTunnelSession: async () => {
      throw new Error('unexpected tunnel launch')
    },
    resolvePreferredTunnelPort: async (port: number) => port
  })

  const result = await launcher.launchShortcut('shortcut-1', { cols: 132, rows: 40 })

  assert.equal(result.launchKind, 'ssm')
  assert.deepEqual(calls, [
    'instances:profile-2',
    'ssm:{"profileId":"profile-2","profileName":"prod-admin","region":"ap-northeast-2","instanceId":"i-0123456789abcdef0","instanceName":"api-server","cols":132,"rows":40,"awsCliPath":"/opt/homebrew/bin/aws","env":{"AWS_REGION":"ap-northeast-2","AWS_DEFAULT_REGION":"ap-northeast-2"}}'
  ])
  assert.deepEqual(recorded, [
    {
      label: 'api shell',
      profileId: 'profile-2',
      profileName: 'prod-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0123456789abcdef0',
        instanceName: 'api-server'
      }
    }
  ])
})

test('launchShortcut rejects stale SSM shortcuts before opening a session', async () => {
  const { QuickAccessLauncher } = await import('./quick-access-launcher')
  let recorded = false

  const launcher = new QuickAccessLauncher({
    quickAccessStore: {
      getSavedShortcut: async () => createSavedShortcut(),
      recordRecentLaunch: async () => {
        recorded = true
      }
    },
    getExecutionContext: async () => ({
      profile: {
        id: 'profile-2',
        name: 'prod-admin',
        region: 'ap-northeast-2'
      },
      awsCliPath: '/opt/homebrew/bin/aws',
      env: {
        AWS_REGION: 'ap-northeast-2',
        AWS_DEFAULT_REGION: 'ap-northeast-2'
      }
    }),
    listEc2Instances: async () => [],
    listTunnelTargets: async () => [],
    openSsmSession: async () => {
      throw new Error('should not open session')
    },
    openTunnelSession: async () => {
      throw new Error('should not open tunnel')
    },
    resolvePreferredTunnelPort: async (port: number) => port
  })

  await assert.rejects(
    launcher.launchShortcut('shortcut-1', { cols: 120, rows: 30 }),
    /no longer available/i
  )
  assert.equal(recorded, false)
})

test('launchShortcut resolves a free tunnel port before opening a saved tunnel', async () => {
  const { QuickAccessLauncher } = await import('./quick-access-launcher')
  const calls: string[] = []

  const launcher = new QuickAccessLauncher({
    quickAccessStore: {
      getSavedShortcut: async () =>
        createSavedShortcut({
          label: 'orders db tunnel',
          launchKind: 'tunnel',
          payload: {
            targetId: 'db-cluster:orders',
            targetKind: 'db',
            targetName: 'orders-db',
            targetEndpoint: 'orders.cluster-abc.apne2.rds.amazonaws.com',
            remotePort: 5432,
            jumpInstanceId: 'i-0feedfacefeedface',
            jumpInstanceName: 'orders-bastion',
            preferredLocalPort: 15432
          }
        }),
      recordRecentLaunch: async () => {}
    },
    getExecutionContext: async () => ({
      profile: {
        id: 'profile-2',
        name: 'prod-admin',
        region: 'ap-northeast-2'
      },
      awsCliPath: '/opt/homebrew/bin/aws',
      env: {
        AWS_REGION: 'ap-northeast-2',
        AWS_DEFAULT_REGION: 'ap-northeast-2'
      }
    }),
    listEc2Instances: async (profileId: string) => {
      calls.push(`instances:${profileId}`)
      return [
      {
        id: 'i-0feedfacefeedface',
        name: 'orders-bastion',
        state: 'running',
        privateIpAddress: '10.0.0.20',
        availabilityZone: 'ap-northeast-2a'
      }
    ]},
    listTunnelTargets: async (profileId: string, kind: string) => {
      calls.push(`targets:${profileId}:${kind}`)
      return [
      {
        id: 'db-cluster:orders',
        kind: 'db',
        name: 'orders-db',
        engine: 'aurora-postgresql',
        endpoint: 'orders.cluster-abc.apne2.rds.amazonaws.com',
        remotePort: 5432,
        source: 'rds-cluster'
      }
    ]},
    openSsmSession: async () => {
      throw new Error('unexpected ssm launch')
    },
    openTunnelSession: async (input: unknown) => {
      calls.push(JSON.stringify(input))
      return {
        id: 'tunnel-1',
        targetName: 'orders-db',
        targetKind: 'db',
        targetEndpoint: 'orders.cluster-abc.apne2.rds.amazonaws.com',
        remotePort: 5432,
        localPort: 16432,
        jumpInstanceId: 'i-0feedfacefeedface',
        jumpInstanceName: 'orders-bastion',
        profileId: 'profile-2',
        profileName: 'prod-admin',
        region: 'ap-northeast-2',
        status: 'open',
        openedAt: 1
      }
    },
    resolvePreferredTunnelPort: async (port: number) => {
      calls.push(`resolve:${port}`)
      return 16432
    }
  })

  const result = await launcher.launchShortcut('shortcut-1', { cols: 120, rows: 30 })

  assert.equal(result.launchKind, 'tunnel')
  assert.deepEqual(calls, [
    'instances:profile-2',
    'targets:profile-2:db',
    'resolve:15432',
    '{"profileId":"profile-2","profileName":"prod-admin","region":"ap-northeast-2","jumpInstanceId":"i-0feedfacefeedface","jumpInstanceName":"orders-bastion","targetName":"orders-db","targetKind":"db","targetEndpoint":"orders.cluster-abc.apne2.rds.amazonaws.com","remotePort":5432,"localPort":16432,"awsCliPath":"/opt/homebrew/bin/aws","env":{"AWS_REGION":"ap-northeast-2","AWS_DEFAULT_REGION":"ap-northeast-2"}}'
  ])
})
