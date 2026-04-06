import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAppReadinessState } from './app-readiness'

const dependencyStatus = {
  awsCli: {
    installed: true,
    resolvedPath: '/opt/homebrew/bin/aws',
    source: 'configured' as const,
    error: null
  },
  sessionManagerPlugin: {
    installed: true,
    resolvedPath: '/opt/homebrew/bin/session-manager-plugin',
    source: 'configured' as const,
    error: null
  }
}

test('buildAppReadinessState requests keychain notice when profiles exist and notice is not accepted', () => {
  const readiness = buildAppReadinessState({
    dependencyStatus,
    profiles: [
      {
        id: 'profile-1',
        name: 'dev-admin',
        region: 'ap-northeast-2',
        createdAt: '2026-03-31T00:00:00.000Z',
        updatedAt: '2026-03-31T00:00:00.000Z',
        hasSessionToken: false,
        isDefault: true
      }
    ],
    runtimeConfig: {
      awsCliPath: null,
      sessionManagerPluginPath: null
    },
    appSettings: {
      language: null,
      theme: null,
      uiScale: null,
      selectedProfileId: null
    },
    canImportLegacyProfiles: false,
    keychainAccessNoticeAcceptedAt: null
  })

  assert.equal(readiness.needsKeychainAccessNotice, true)
})

test('buildAppReadinessState skips keychain notice after acceptance', () => {
  const readiness = buildAppReadinessState({
    dependencyStatus,
    profiles: [
      {
        id: 'profile-1',
        name: 'dev-admin',
        region: 'ap-northeast-2',
        createdAt: '2026-03-31T00:00:00.000Z',
        updatedAt: '2026-03-31T00:00:00.000Z',
        hasSessionToken: false,
        isDefault: true
      }
    ],
    runtimeConfig: {
      awsCliPath: null,
      sessionManagerPluginPath: null
    },
    appSettings: {
      language: null,
      theme: null,
      uiScale: null,
      selectedProfileId: null
    },
    canImportLegacyProfiles: false,
    keychainAccessNoticeAcceptedAt: '2026-03-31T00:00:00.000Z'
  })

  assert.equal(readiness.needsKeychainAccessNotice, false)
})
