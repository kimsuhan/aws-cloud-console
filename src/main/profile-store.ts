import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type { AppLanguage, AppTheme, AppUiScale } from '../shared/contracts'
import { listCredentialProfiles, parseIniSections, resolveProfileRegion } from './aws-config'

export interface AppProfileRecord {
  id: string
  name: string
  region: string
  createdAt: string
  updatedAt: string
  hasSessionToken: boolean
  isDefault: boolean
}

export interface AppProfileCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface CreateProfileInput {
  name: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface UpdateProfileInput {
  name: string
  region: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
}

export interface RuntimeSettings {
  activeProfileId: string | null
  awsCliPath: string | null
  sessionManagerPluginPath: string | null
  language: AppLanguage | null
  theme: AppTheme | null
  uiScale: AppUiScale | null
  selectedProfileId: string | null
  legacyImportDismissedAt: string | null
  keychainAccessNoticeAcceptedAt: string | null
}

export interface ActiveProfileWithCredentials {
  profile: AppProfileRecord
  credentials: AppProfileCredentials
}

export interface ImportLegacyProfilesInput {
  credentialsContent: string
  configContent: string
}

export interface ImportLegacyProfilesResult {
  importedCount: number
  skippedCount: number
}

interface StoredProfilesFile {
  profiles: AppProfileRecord[]
  settings: RuntimeSettings
}

interface StoredSecretsFile {
  secretsByProfileId: Record<string, string>
}

interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

interface AppProfileStoreOptions {
  userDataPath: string
  safeStorage: SafeStorageLike
  now?: () => Date
  generateId?: () => string
}

interface PersistedState {
  profilesFile: StoredProfilesFile
  secretsFile: StoredSecretsFile
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  activeProfileId: null,
  awsCliPath: null,
  sessionManagerPluginPath: null,
  language: null,
  theme: null,
  uiScale: null,
  selectedProfileId: null,
  legacyImportDismissedAt: null,
  keychainAccessNoticeAcceptedAt: null
}

function emptyState(): PersistedState {
  return {
    profilesFile: {
      profiles: [],
      settings: { ...DEFAULT_SETTINGS }
    },
    secretsFile: {
      secretsByProfileId: {}
    }
  }
}

export class AppProfileStore {
  readonly #userDataPath: string
  readonly #safeStorage: SafeStorageLike
  readonly #now: () => Date
  readonly #generateId: () => string

  constructor(options: AppProfileStoreOptions) {
    this.#userDataPath = options.userDataPath
    this.#safeStorage = options.safeStorage
    this.#now = options.now ?? (() => new Date())
    this.#generateId = options.generateId ?? (() => randomUUID())
  }

  async listProfiles(): Promise<AppProfileRecord[]> {
    const state = await this.#readState()
    return [...state.profilesFile.profiles].sort((left, right) => left.name.localeCompare(right.name))
  }

  async getRuntimeSettings(): Promise<RuntimeSettings> {
    const state = await this.#readState()
    return { ...state.profilesFile.settings }
  }

  async getActiveProfile(): Promise<AppProfileRecord | null> {
    const state = await this.#readState()
    const activeProfileId = state.profilesFile.settings.activeProfileId

    if (!activeProfileId) {
      return null
    }

    return this.#requireProfile(state, activeProfileId)
  }

  async updateRuntimeSettings(settings: Partial<Omit<RuntimeSettings, 'activeProfileId'>>): Promise<RuntimeSettings> {
    const state = await this.#readState()
    state.profilesFile.settings = {
      ...state.profilesFile.settings,
      ...settings
    }
    await this.#writeState(state)
    return { ...state.profilesFile.settings }
  }

  async createProfile(input: CreateProfileInput): Promise<AppProfileRecord> {
    this.#assertEncryptionAvailable()
    const state = await this.#readState()
    const timestamp = this.#now().toISOString()
    const shouldBeDefault = state.profilesFile.profiles.length === 0
    const profile: AppProfileRecord = {
      id: this.#generateId(),
      name: input.name,
      region: input.region,
      createdAt: timestamp,
      updatedAt: timestamp,
      hasSessionToken: Boolean(input.sessionToken),
      isDefault: shouldBeDefault
    }

    state.profilesFile.profiles.push(profile)
    if (shouldBeDefault) {
      state.profilesFile.settings.activeProfileId = profile.id
    }
    state.secretsFile.secretsByProfileId[profile.id] = this.#encryptCredentials({
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
      sessionToken: input.sessionToken
    })
    await this.#writeState(state)
    return profile
  }

  async updateProfile(profileId: string, input: UpdateProfileInput): Promise<AppProfileRecord> {
    const state = await this.#readState()
    const profile = this.#requireProfile(state, profileId)
    const existingCredentials = this.#decryptCredentials(state.secretsFile.secretsByProfileId[profileId] ?? '')
    const nextCredentials = {
      accessKeyId: input.accessKeyId ?? existingCredentials.accessKeyId,
      secretAccessKey: input.secretAccessKey ?? existingCredentials.secretAccessKey,
      sessionToken: input.sessionToken === undefined ? existingCredentials.sessionToken : input.sessionToken || undefined
    }
    const nextProfile: AppProfileRecord = {
      ...profile,
      name: input.name,
      region: input.region,
      updatedAt: this.#now().toISOString(),
      hasSessionToken: Boolean(nextCredentials.sessionToken)
    }

    state.profilesFile.profiles = state.profilesFile.profiles.map((candidate) =>
      candidate.id === profileId ? nextProfile : candidate
    )
    state.secretsFile.secretsByProfileId[profileId] = this.#encryptCredentials(nextCredentials)
    await this.#writeState(state)
    return nextProfile
  }

  async deleteProfile(profileId: string): Promise<void> {
    const state = await this.#readState()
    const deletedProfile = this.#requireProfile(state, profileId)
    state.profilesFile.profiles = state.profilesFile.profiles.filter((profile) => profile.id !== profileId)
    delete state.secretsFile.secretsByProfileId[profileId]

    if (state.profilesFile.settings.activeProfileId === profileId) {
      state.profilesFile.settings.activeProfileId = null
    }
    if (state.profilesFile.settings.selectedProfileId === profileId) {
      state.profilesFile.settings.selectedProfileId = state.profilesFile.profiles[0]?.id ?? null
    }

    if (deletedProfile.isDefault && state.profilesFile.profiles[0]) {
      state.profilesFile.profiles[0] = {
        ...state.profilesFile.profiles[0],
        isDefault: true
      }
    }

    if (!state.profilesFile.settings.activeProfileId && state.profilesFile.profiles[0]) {
      state.profilesFile.settings.activeProfileId = state.profilesFile.profiles[0].id
    }

    await this.#writeState(state)
  }

  async selectActiveProfile(profileId: string): Promise<AppProfileRecord> {
    const state = await this.#readState()
    const profile = this.#requireProfile(state, profileId)
    state.profilesFile.settings.activeProfileId = profile.id
    await this.#writeState(state)
    return profile
  }

  async setDefaultProfile(profileId: string): Promise<AppProfileRecord> {
    const state = await this.#readState()
    const profile = this.#requireProfile(state, profileId)
    state.profilesFile.profiles = state.profilesFile.profiles.map((candidate) => ({
      ...candidate,
      isDefault: candidate.id === profileId
    }))
    state.profilesFile.settings.activeProfileId = profileId
    await this.#writeState(state)
    return this.#requireProfile(state, profileId)
  }

  async getActiveProfileCredentials(): Promise<ActiveProfileWithCredentials | null> {
    const profile = await this.getActiveProfile()
    if (!profile) {
      return null
    }

    const state = await this.#readState()
    return {
      profile,
      credentials: this.#decryptCredentials(state.secretsFile.secretsByProfileId[profile.id] ?? '')
    }
  }

  async getProfileCredentials(profileId: string): Promise<ActiveProfileWithCredentials> {
    const state = await this.#readState()
    const profile = this.#requireProfile(state, profileId)

    return {
      profile,
      credentials: this.#decryptCredentials(state.secretsFile.secretsByProfileId[profile.id] ?? '')
    }
  }

  async acceptKeychainAccessNotice(): Promise<void> {
    const state = await this.#readState()
    state.profilesFile.settings.keychainAccessNoticeAcceptedAt = this.#now().toISOString()
    await this.#writeState(state)
  }

  async resetKeychainAccessNotice(): Promise<void> {
    const state = await this.#readState()
    state.profilesFile.settings.keychainAccessNoticeAcceptedAt = null
    await this.#writeState(state)
  }

  async resetAppData(): Promise<void> {
    await this.#writeState(emptyState())
  }

  async importLegacyProfiles(input: ImportLegacyProfilesInput): Promise<ImportLegacyProfilesResult> {
    this.#assertEncryptionAvailable()
    const credentialsSections = parseIniSections(input.credentialsContent)
    const state = await this.#readState()
    let importedCount = 0
    let skippedCount = 0

    for (const profileName of listCredentialProfiles(input.credentialsContent)) {
      if (state.profilesFile.profiles.some((profile) => profile.name === profileName)) {
        skippedCount += 1
        continue
      }

      const section = credentialsSections.get(profileName)
      const accessKeyId = section?.get('aws_access_key_id')
      const secretAccessKey = section?.get('aws_secret_access_key')
      const region = resolveProfileRegion(profileName, input.configContent)

      if (!accessKeyId || !secretAccessKey || !region) {
        skippedCount += 1
        continue
      }

      const timestamp = this.#now().toISOString()
      const profile: AppProfileRecord = {
        id: this.#generateId(),
        name: profileName,
        region,
        createdAt: timestamp,
        updatedAt: timestamp,
        hasSessionToken: Boolean(section?.get('aws_session_token')),
        isDefault: importedCount === 0 && state.profilesFile.profiles.length === 0
      }

      state.profilesFile.profiles.push(profile)
      state.secretsFile.secretsByProfileId[profile.id] = this.#encryptCredentials({
        accessKeyId,
        secretAccessKey,
        sessionToken: section?.get('aws_session_token')
      })
      if (!state.profilesFile.settings.activeProfileId) {
        state.profilesFile.settings.activeProfileId = profile.id
      }
      importedCount += 1
    }

    await this.#writeState(state)
    return { importedCount, skippedCount }
  }

  #assertEncryptionAvailable(): void {
    if (!this.#safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable on this system.')
    }
  }

  #encryptCredentials(credentials: AppProfileCredentials): string {
    return this.#safeStorage.encryptString(JSON.stringify(credentials)).toString('base64')
  }

  #decryptCredentials(payload: string): AppProfileCredentials {
    if (!payload) {
      throw new Error('Missing stored credentials for profile.')
    }

    const decrypted = this.#safeStorage.decryptString(Buffer.from(payload, 'base64'))
    return JSON.parse(decrypted) as AppProfileCredentials
  }

  async #readState(): Promise<PersistedState> {
    await mkdir(this.#userDataPath, { recursive: true })
    const [profilesFile, secretsFile] = await Promise.all([
      this.#readJsonFile<StoredProfilesFile>('profiles.json', {
        profiles: [],
        settings: { ...DEFAULT_SETTINGS }
      }),
      this.#readJsonFile<StoredSecretsFile>('secrets.json', { secretsByProfileId: {} })
    ])

    return {
      profilesFile,
      secretsFile
    }
  }

  async #readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
    const filePath = path.join(this.#userDataPath, fileName)

    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return fallback
      }

      throw error
    }
  }

  async #writeState(state: PersistedState): Promise<void> {
    await mkdir(this.#userDataPath, { recursive: true })
    await Promise.all([
      writeFile(path.join(this.#userDataPath, 'profiles.json'), JSON.stringify(state.profilesFile, null, 2)),
      writeFile(path.join(this.#userDataPath, 'secrets.json'), JSON.stringify(state.secretsFile, null, 2))
    ])
  }

  #requireProfile(state: PersistedState, profileId: string): AppProfileRecord {
    const profile = state.profilesFile.profiles.find((candidate) => candidate.id === profileId)

    if (!profile) {
      throw new Error(`Profile "${profileId}" was not found.`)
    }

    return profile
  }
}
