import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'

interface StoredQuickAccessFile {
  favorites: Array<{ id: string; label: string; launchKind: string }>
  presets: Array<{ id: string; label: string; launchKind: string }>
  recents: Array<{ id: string; label: string; launchKind: string; launchedAt: string }>
}

async function createStore(rootDir: string) {
  const { QuickAccessStore } = await import('./quick-access-store')

  return new QuickAccessStore({
    userDataPath: rootDir,
    now: () => new Date('2026-03-31T09:10:11.000Z'),
    generateId: (() => {
      let nextId = 0
      return () => `shortcut-${++nextId}`
    })(),
    recentLimitPerKind: 2
  })
}

test('createSavedShortcut stores favorites and presets in separate collections', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'quick-access-store-'))

  try {
    const store = await createStore(rootDir)

    await store.createSavedShortcut({
      category: 'favorite',
      label: 'api shell',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0123456789abcdef0',
        instanceName: 'api-server'
      }
    })

    await store.createSavedShortcut({
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
        jumpInstanceId: 'i-0feedfacefeedface',
        jumpInstanceName: 'orders-bastion',
        preferredLocalPort: 15432
      }
    })

    const quickAccess = await store.getQuickAccess()
    const storedFile = JSON.parse(
      await readFile(path.join(rootDir, 'quick-access.json'), 'utf8')
    ) as StoredQuickAccessFile

    assert.equal(quickAccess.favorites.length, 1)
    assert.equal(quickAccess.favorites[0]?.label, 'api shell')
    assert.equal(quickAccess.presets.length, 1)
    assert.equal(quickAccess.presets[0]?.label, 'orders db tunnel')
    assert.deepEqual(quickAccess.recents, [])
    assert.deepEqual(storedFile.favorites.map((item) => item.label), ['api shell'])
    assert.deepEqual(storedFile.presets.map((item) => item.label), ['orders db tunnel'])
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('deleteSavedShortcut removes only the targeted favorite or preset', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'quick-access-store-'))

  try {
    const store = await createStore(rootDir)

    const favorite = await store.createSavedShortcut({
      category: 'favorite',
      label: 'api shell',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0123456789abcdef0',
        instanceName: 'api-server'
      }
    })

    await store.createSavedShortcut({
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
        jumpInstanceId: 'i-0feedfacefeedface',
        jumpInstanceName: 'orders-bastion',
        preferredLocalPort: 15432
      }
    })

    await store.deleteSavedShortcut(favorite.id)

    const quickAccess = await store.getQuickAccess()

    assert.deepEqual(quickAccess.favorites, [])
    assert.deepEqual(quickAccess.presets.map((item) => item.label), ['orders db tunnel'])
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('recordRecentLaunch keeps the newest entries and caps history per launch kind', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'quick-access-store-'))

  try {
    const store = await createStore(rootDir)

    await store.recordRecentLaunch({
      label: 'api shell',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0123456789abcdef0',
        instanceName: 'api-server'
      }
    })

    await store.recordRecentLaunch({
      label: 'worker shell',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0abcdef0123456789',
        instanceName: 'worker-server'
      }
    })

    await store.recordRecentLaunch({
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
        jumpInstanceId: 'i-0feedfacefeedface',
        jumpInstanceName: 'orders-bastion',
        preferredLocalPort: 15432
      }
    })

    await store.recordRecentLaunch({
      label: 'admin shell',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0ff1ce0ff1ce0ff1c',
        instanceName: 'admin-server'
      }
    })

    const quickAccess = await store.getQuickAccess()

    assert.deepEqual(
      quickAccess.recents.map((item) => `${item.launchKind}:${item.label}`),
      ['ssm:admin shell', 'tunnel:orders db tunnel', 'ssm:worker shell']
    )
    assert.equal(quickAccess.recents.some((item) => item.label === 'api shell'), false)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
