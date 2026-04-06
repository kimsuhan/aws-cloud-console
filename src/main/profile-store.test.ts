import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'

import { AppProfileStore } from './profile-store'

interface StoredProfilesFile {
  profiles: Array<{
    id: string
    name: string
    region: string
    createdAt: string
    updatedAt: string
    hasSessionToken: boolean
    isDefault: boolean
  }>
  settings: {
    activeProfileId: string | null
    awsCliPath: string | null
    sessionManagerPluginPath: string | null
    language: 'ko' | 'en' | null
    theme: 'system' | 'light' | 'dark' | null
    uiScale: 'system' | '90' | '100' | '110' | '120' | null
    selectedProfileId: string | null
    legacyImportDismissedAt: string | null
    keychainAccessNoticeAcceptedAt: string | null
  }
}

interface StoredSecretsFile {
  secretsByProfileId: Record<string, string>
}

function createStore(rootDir: string): AppProfileStore {
  return new AppProfileStore({
    userDataPath: rootDir,
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`enc:${value}`, 'utf8'),
      decryptString: (value) => Buffer.from(value).toString('utf8').replace(/^enc:/, '')
    },
    now: () => new Date('2026-03-30T01:02:03.000Z'),
    generateId: () => 'profile-1'
  })
}

test('createProfile stores metadata separately from encrypted secrets and selects default profile', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'profile-store-'))

  try {
    const store = createStore(rootDir)
    const profile = await store.createProfile({
      name: 'dev-admin',
      region: 'ap-northeast-2',
      accessKeyId: 'AKIADEVADMIN',
      secretAccessKey: 'super-secret',
      sessionToken: 'token-123'
    })

    assert.equal(profile.id, 'profile-1')
    assert.equal(profile.isDefault, true)
    assert.equal(profile.hasSessionToken, true)

    const storedProfiles = JSON.parse(
      await readFile(path.join(rootDir, 'profiles.json'), 'utf8')
    ) as StoredProfilesFile
    const storedSecrets = JSON.parse(
      await readFile(path.join(rootDir, 'secrets.json'), 'utf8')
    ) as StoredSecretsFile

    assert.deepEqual(storedProfiles.settings, {
      activeProfileId: 'profile-1',
      awsCliPath: null,
      sessionManagerPluginPath: null,
      language: null,
      theme: null,
      uiScale: null,
      selectedProfileId: null,
      legacyImportDismissedAt: null,
      keychainAccessNoticeAcceptedAt: null
    })
    assert.equal(storedProfiles.profiles.length, 1)
    assert.equal(storedProfiles.profiles[0]?.name, 'dev-admin')
    assert.equal(storedProfiles.profiles[0]?.region, 'ap-northeast-2')
    assert.equal(storedProfiles.profiles[0]?.hasSessionToken, true)
    assert.equal(storedSecrets.secretsByProfileId['profile-1'].includes('super-secret'), false)
    assert.equal(storedSecrets.secretsByProfileId['profile-1'].includes('AKIADEVADMIN'), false)

    assert.deepEqual(await store.getActiveProfileCredentials(), {
      profile: {
        id: 'profile-1',
        name: 'dev-admin',
        region: 'ap-northeast-2',
        createdAt: '2026-03-30T01:02:03.000Z',
        updatedAt: '2026-03-30T01:02:03.000Z',
        hasSessionToken: true,
        isDefault: true
      },
      credentials: {
        accessKeyId: 'AKIADEVADMIN',
        secretAccessKey: 'super-secret',
        sessionToken: 'token-123'
      }
    })
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('deleteProfile removes metadata and encrypted secret blob', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'profile-store-'))

  try {
    const store = createStore(rootDir)
    await store.createProfile({
      name: 'dev-admin',
      region: 'ap-northeast-2',
      accessKeyId: 'AKIADEVADMIN',
      secretAccessKey: 'super-secret'
    })

    await store.deleteProfile('profile-1')

    const storedProfiles = JSON.parse(
      await readFile(path.join(rootDir, 'profiles.json'), 'utf8')
    ) as StoredProfilesFile
    const storedSecrets = JSON.parse(
      await readFile(path.join(rootDir, 'secrets.json'), 'utf8')
    ) as StoredSecretsFile

    assert.deepEqual(storedProfiles.profiles, [])
    assert.equal(storedProfiles.settings.activeProfileId, null)
    assert.deepEqual(storedSecrets.secretsByProfileId, {})
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('getActiveProfile returns metadata without decrypting secrets', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'profile-store-'))
  let decryptCalls = 0

  try {
    const store = new AppProfileStore({
      userDataPath: rootDir,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`enc:${value}`, 'utf8'),
        decryptString: (value) => {
          decryptCalls += 1
          return Buffer.from(value).toString('utf8').replace(/^enc:/, '')
        }
      },
      now: () => new Date('2026-03-30T01:02:03.000Z'),
      generateId: () => 'profile-1'
    })

    await store.createProfile({
      name: 'dev-admin',
      region: 'ap-northeast-2',
      accessKeyId: 'AKIADEVADMIN',
      secretAccessKey: 'super-secret'
    })

    const profile = await store.getActiveProfile()

    assert.equal(profile?.id, 'profile-1')
    assert.equal(decryptCalls, 0)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('acceptKeychainAccessNotice persists the one-time notice flag', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'profile-store-'))

  try {
    const store = createStore(rootDir)
    await store.acceptKeychainAccessNotice()

    const storedProfiles = JSON.parse(
      await readFile(path.join(rootDir, 'profiles.json'), 'utf8')
    ) as StoredProfilesFile

    assert.equal(storedProfiles.settings.keychainAccessNoticeAcceptedAt, '2026-03-30T01:02:03.000Z')
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('resetKeychainAccessNotice clears the one-time notice flag', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'profile-store-'))

  try {
    const store = createStore(rootDir)
    await store.acceptKeychainAccessNotice()
    await store.resetKeychainAccessNotice()

    const storedProfiles = JSON.parse(
      await readFile(path.join(rootDir, 'profiles.json'), 'utf8')
    ) as StoredProfilesFile

    assert.equal(storedProfiles.settings.keychainAccessNoticeAcceptedAt, null)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('resetAppData clears profiles, secrets, and stored settings', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'profile-store-'))

  try {
    const store = createStore(rootDir)
    await store.createProfile({
      name: 'dev-admin',
      region: 'ap-northeast-2',
      accessKeyId: 'AKIADEVADMIN',
      secretAccessKey: 'super-secret'
    })
    await store.acceptKeychainAccessNotice()
    await store.updateRuntimeSettings({
      awsCliPath: '/opt/homebrew/bin/aws',
      sessionManagerPluginPath: '/opt/homebrew/bin/session-manager-plugin',
      legacyImportDismissedAt: '2026-03-30T02:00:00.000Z'
    })

    await store.resetAppData()

    const storedProfiles = JSON.parse(
      await readFile(path.join(rootDir, 'profiles.json'), 'utf8')
    ) as StoredProfilesFile
    const storedSecrets = JSON.parse(
      await readFile(path.join(rootDir, 'secrets.json'), 'utf8')
    ) as StoredSecretsFile

    assert.deepEqual(storedProfiles.profiles, [])
    assert.deepEqual(storedProfiles.settings, {
      activeProfileId: null,
      awsCliPath: null,
      sessionManagerPluginPath: null,
      language: null,
      theme: null,
      uiScale: null,
      selectedProfileId: null,
      legacyImportDismissedAt: null,
      keychainAccessNoticeAcceptedAt: null
    })
    assert.deepEqual(storedSecrets.secretsByProfileId, {})
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('importLegacyProfiles creates app-managed profiles with regions and default selection', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'profile-store-'))
  let nextId = 0

  try {
    const store = new AppProfileStore({
      userDataPath: rootDir,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`enc:${value}`, 'utf8'),
        decryptString: (value) => Buffer.from(value).toString('utf8').replace(/^enc:/, '')
      },
      now: () => new Date('2026-03-30T01:02:03.000Z'),
      generateId: () => `profile-${++nextId}`
    })

    const result = await store.importLegacyProfiles({
      credentialsContent: `
[default]
aws_access_key_id = AKIADEFAULT
aws_secret_access_key = default-secret

[dev-admin]
aws_access_key_id = AKIADEV
aws_secret_access_key = dev-secret
aws_session_token = dev-token
`,
      configContent: `
[default]
region = us-west-2

[profile dev-admin]
region = ap-northeast-2
`
    })

    assert.equal(result.importedCount, 2)
    assert.equal(result.skippedCount, 0)

    const profiles = await store.listProfiles()
    assert.deepEqual(
      profiles.map((profile) => ({
        name: profile.name,
        region: profile.region,
        hasSessionToken: profile.hasSessionToken,
        isDefault: profile.isDefault
      })),
      [
        {
          name: 'default',
          region: 'us-west-2',
          hasSessionToken: false,
          isDefault: true
        },
        {
          name: 'dev-admin',
          region: 'ap-northeast-2',
          hasSessionToken: true,
          isDefault: false
        }
      ]
    )

    const activeProfile = await store.getActiveProfileCredentials()
    assert.equal(activeProfile?.profile.name, 'default')
    assert.equal(activeProfile?.credentials.accessKeyId, 'AKIADEFAULT')
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('updateRuntimeSettings persists the selected app language, theme, and UI scale', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'profile-store-'))

  try {
    const store = createStore(rootDir)
    await store.updateRuntimeSettings({
      language: 'ko',
      theme: 'dark',
      uiScale: '110',
      selectedProfileId: 'profile-1'
    })

    const storedProfiles = JSON.parse(
      await readFile(path.join(rootDir, 'profiles.json'), 'utf8')
    ) as StoredProfilesFile

    assert.equal(storedProfiles.settings.language, 'ko')
    assert.equal(storedProfiles.settings.theme, 'dark')
    assert.equal(storedProfiles.settings.uiScale, '110')
    assert.equal(storedProfiles.settings.selectedProfileId, 'profile-1')
    assert.equal((await store.getRuntimeSettings()).language, 'ko')
    assert.equal((await store.getRuntimeSettings()).theme, 'dark')
    assert.equal((await store.getRuntimeSettings()).uiScale, '110')
    assert.equal((await store.getRuntimeSettings()).selectedProfileId, 'profile-1')
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
