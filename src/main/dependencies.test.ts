import test from 'node:test'
import assert from 'node:assert/strict'

import { detectDependencies } from './dependencies'

test('detectDependencies prefers configured paths over PATH', async () => {
  const result = await detectDependencies(
    {
      awsCliPath: '/custom/aws',
      sessionManagerPluginPath: '/custom/session-manager-plugin'
    },
    {
      fileExists(filePath) {
        return Promise.resolve(filePath.startsWith('/custom/'))
      },
      which(command) {
        return Promise.resolve(command === 'aws' ? '/usr/local/bin/aws' : '/usr/local/bin/session-manager-plugin')
      }
    }
  )

  assert.deepEqual(result, {
    awsCli: {
      installed: true,
      resolvedPath: '/custom/aws',
      source: 'configured',
      error: null
    },
    sessionManagerPlugin: {
      installed: true,
      resolvedPath: '/custom/session-manager-plugin',
      source: 'configured',
      error: null
    }
  })
})

test('detectDependencies falls back to PATH lookup and reports missing executables', async () => {
  const result = await detectDependencies(
    {
      awsCliPath: null,
      sessionManagerPluginPath: null
    },
    {
      fileExists() {
        return Promise.resolve(false)
      },
      which(command) {
        return Promise.resolve(command === 'aws' ? '/opt/homebrew/bin/aws' : null)
      },
      wellKnownPaths: {
        awsCli: ['/usr/local/bin/aws'],
        sessionManagerPlugin: ['/usr/local/bin/session-manager-plugin']
      }
    }
  )

  assert.deepEqual(result, {
    awsCli: {
      installed: true,
      resolvedPath: '/opt/homebrew/bin/aws',
      source: 'path',
      error: null
    },
    sessionManagerPlugin: {
      installed: false,
      resolvedPath: null,
      source: 'missing',
      error: 'Unable to locate session-manager-plugin.'
    }
  })
})
