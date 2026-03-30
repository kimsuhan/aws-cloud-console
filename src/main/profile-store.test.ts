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
    legacyImportDismissedAt: string | null
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
      legacyImportDismissedAt: null
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
