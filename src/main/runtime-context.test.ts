import test from 'node:test'
import assert from 'node:assert/strict'

import { buildExecutionContext } from './runtime-context'

const originalPath = process.env['PATH']

const activeProfile = {
  profile: {
    id: 'profile-1',
    name: 'dev-admin',
    region: 'ap-northeast-2',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    hasSessionToken: true,
    isDefault: true
  },
  credentials: {
    accessKeyId: 'AKIADEVADMIN',
    secretAccessKey: 'super-secret',
    sessionToken: 'token-123'
  }
}

test('buildExecutionContext returns resolved binary paths and injected AWS environment', () => {
  const context = buildExecutionContext(activeProfile, {
    awsCli: {
      installed: true,
      resolvedPath: '/opt/homebrew/bin/aws',
      source: 'configured',
      error: null
    },
    sessionManagerPlugin: {
      installed: true,
      resolvedPath: '/opt/homebrew/bin/session-manager-plugin',
      source: 'well-known',
      error: null
    }
  })

  assert.deepEqual(context, {
    profile: activeProfile.profile,
    awsCliPath: '/opt/homebrew/bin/aws',
    sessionManagerPluginPath: '/opt/homebrew/bin/session-manager-plugin',
    env: {
      AWS_ACCESS_KEY_ID: 'AKIADEVADMIN',
      AWS_SECRET_ACCESS_KEY: 'super-secret',
      AWS_SESSION_TOKEN: 'token-123',
      AWS_REGION: 'ap-northeast-2',
      AWS_DEFAULT_REGION: 'ap-northeast-2',
      PATH: context.env['PATH']
    }
  })
  assert.match(context.env['PATH'] ?? '', /(^|:)\/opt\/homebrew\/bin(:|$)/)
})

test('buildExecutionContext prepends resolved tool directories to PATH for spawned AWS sessions', () => {
  process.env['PATH'] = '/usr/bin:/bin'

  const context = buildExecutionContext(activeProfile, {
    awsCli: {
      installed: true,
      resolvedPath: '/opt/homebrew/bin/aws',
      source: 'configured',
      error: null
    },
    sessionManagerPlugin: {
      installed: true,
      resolvedPath: '/usr/local/sessionmanagerplugin/bin/session-manager-plugin',
      source: 'configured',
      error: null
    }
  })

  assert.equal(
    context.env['PATH'],
    '/opt/homebrew/bin:/usr/local/sessionmanagerplugin/bin:/usr/bin:/bin'
  )
})

test('buildExecutionContext fails closed when required dependencies are missing', () => {
  assert.throws(
    () =>
      buildExecutionContext(activeProfile, {
        awsCli: {
          installed: false,
          resolvedPath: null,
          source: 'missing',
          error: 'Unable to locate aws CLI.'
        },
        sessionManagerPlugin: {
          installed: true,
          resolvedPath: '/opt/homebrew/bin/session-manager-plugin',
          source: 'well-known',
          error: null
        }
      }),
    /Unable to locate aws CLI\./
  )
})

test.after(() => {
  if (originalPath === undefined) {
    delete process.env['PATH']
    return
  }

  process.env['PATH'] = originalPath
})
