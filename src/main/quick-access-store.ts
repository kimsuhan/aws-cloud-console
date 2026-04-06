import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type {
  CreateSavedShortcutRequest,
  QuickAccessState,
  RecentLaunchRecord,
  SavedShortcutRecord,
  ShortcutLaunchKind
} from '../shared/contracts'

export type CreateSavedShortcutInput = CreateSavedShortcutRequest
export type RecordRecentLaunchInput = Omit<RecentLaunchRecord, 'id' | 'launchedAt'>

interface QuickAccessStoreOptions {
  userDataPath: string
  now?: () => Date
  generateId?: () => string
  recentLimitPerKind?: number
}

function emptyQuickAccessState(): QuickAccessState {
  return {
    favorites: [],
    presets: [],
    recents: []
  }
}

export class QuickAccessStore {
  readonly #userDataPath: string
  readonly #now: () => Date
  readonly #generateId: () => string
  readonly #recentLimitPerKind: number

  constructor(options: QuickAccessStoreOptions) {
    this.#userDataPath = options.userDataPath
    this.#now = options.now ?? (() => new Date())
    this.#generateId = options.generateId ?? (() => randomUUID())
    this.#recentLimitPerKind = options.recentLimitPerKind ?? 10
  }

  async getQuickAccess(): Promise<QuickAccessState> {
    return this.#readState()
  }

  async getSavedShortcut(shortcutId: string): Promise<SavedShortcutRecord | RecentLaunchRecord | null> {
    const state = await this.#readState()
    return (
      state.favorites.find((item) => item.id === shortcutId) ??
      state.presets.find((item) => item.id === shortcutId) ??
      state.recents.find((item) => item.id === shortcutId) ??
      null
    )
  }

  async createSavedShortcut(input: CreateSavedShortcutInput): Promise<SavedShortcutRecord> {
    const state = await this.#readState()
    const timestamp = this.#now().toISOString()
    const shortcut: SavedShortcutRecord = {
      id: this.#generateId(),
      category: input.category,
      label: input.label,
      profileId: input.profileId,
      profileName: input.profileName,
      region: input.region,
      launchKind: input.launchKind,
      payload: input.payload,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    if (input.category === 'favorite') {
      state.favorites.unshift(shortcut)
    } else {
      state.presets.unshift(shortcut)
    }

    await this.#writeState(state)
    return shortcut
  }

  async deleteSavedShortcut(shortcutId: string): Promise<void> {
    const state = await this.#readState()
    state.favorites = state.favorites.filter((item) => item.id !== shortcutId)
    state.presets = state.presets.filter((item) => item.id !== shortcutId)
    await this.#writeState(state)
  }

  async recordRecentLaunch(input: RecordRecentLaunchInput): Promise<RecentLaunchRecord> {
    const state = await this.#readState()
    const recent: RecentLaunchRecord = {
      id: this.#generateId(),
      label: input.label,
      profileId: input.profileId,
      profileName: input.profileName,
      region: input.region,
      launchKind: input.launchKind,
      payload: input.payload,
      launchedAt: this.#now().toISOString()
    }

    state.recents.unshift(recent)
    state.recents = this.#applyRecentLimit(state.recents)
    await this.#writeState(state)
    return recent
  }

  async reset(): Promise<void> {
    await this.#writeState(emptyQuickAccessState())
  }

  #applyRecentLimit(recents: RecentLaunchRecord[]): RecentLaunchRecord[] {
    const counts: Record<ShortcutLaunchKind, number> = {
      ssm: 0,
      tunnel: 0
    }

    return recents.filter((recent) => {
      if (counts[recent.launchKind] >= this.#recentLimitPerKind) {
        return false
      }

      counts[recent.launchKind] += 1
      return true
    })
  }

  async #readState(): Promise<QuickAccessState> {
    await mkdir(this.#userDataPath, { recursive: true })
    return this.#readJsonFile<QuickAccessState>('quick-access.json', emptyQuickAccessState())
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

  async #writeState(state: QuickAccessState): Promise<void> {
    await mkdir(this.#userDataPath, { recursive: true })
    await writeFile(path.join(this.#userDataPath, 'quick-access.json'), JSON.stringify(state, null, 2))
  }
}
