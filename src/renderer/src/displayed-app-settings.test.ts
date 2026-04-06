import test from 'node:test'
import assert from 'node:assert/strict'

import type { AppReadinessState } from '@shared/contracts'

import { resolveDisplayedAppSettings } from './displayed-app-settings'

const readiness: AppReadinessState = {
  dependencyStatus: {
    awsCli: { installed: true, resolvedPath: '/usr/bin/aws', source: 'path', error: null },
    sessionManagerPlugin: { installed: true, resolvedPath: '/usr/bin/session-manager-plugin', source: 'path', error: null }
  },
  profiles: [],
  runtimeConfig: {
    awsCliPath: '/usr/bin/aws',
    sessionManagerPluginPath: '/usr/bin/session-manager-plugin'
  },
  appSettings: {
    language: 'ko',
    theme: 'dark',
    uiScale: '120',
    selectedProfileId: null
  },
  needsProfileSetup: false,
  needsDependencySetup: false,
  canImportLegacyProfiles: false,
  needsKeychainAccessNotice: false
}

test('resolveDisplayedAppSettings prefers local in-memory settings over stale readiness values', () => {
  const displayed = resolveDisplayedAppSettings(readiness, {
    language: 'en',
    theme: 'light',
    uiScale: '90'
  })

  assert.deepEqual(displayed, {
    appLanguage: 'en',
    appTheme: 'light',
    appUiScale: '90'
  })
})
