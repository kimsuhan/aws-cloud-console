import test from 'node:test'
import assert from 'node:assert/strict'

import { detectDependencies } from './dependencies'

test('detectDependencies reports missing aws cli and session manager plugin', async () => {
  const result = await detectDependencies({
    hasCommand(command) {
      return Promise.resolve(command === 'aws' ? false : false)
    }
  })

  assert.deepEqual(result, {
    awsCliInstalled: false,
    sessionManagerPluginInstalled: false
  })
})

test('detectDependencies reports both commands when available', async () => {
  const result = await detectDependencies({
    hasCommand() {
      return Promise.resolve(true)
    }
  })

  assert.deepEqual(result, {
    awsCliInstalled: true,
    sessionManagerPluginInstalled: true
  })
})
