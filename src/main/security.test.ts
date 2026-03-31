import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildProductionContentSecurityPolicy,
  shouldEnableRemoteDebugging,
  validateCreateProfileRequest,
  validateOpenSessionRequest,
  validateOpenTunnelSessionRequest,
  validateUpdateProfileRequest,
  validateUpdateRuntimePathsRequest
} from './security'

test('validateOpenSessionRequest accepts valid EC2 instance identifiers', () => {
  assert.doesNotThrow(() =>
    validateOpenSessionRequest({
      instanceId: 'i-0123456789abcdef0',
      instanceName: 'api-server',
      cols: 120,
      rows: 30
    })
  )
})

test('validateOpenSessionRequest rejects malformed EC2 instance identifiers', () => {
  assert.throws(
    () =>
      validateOpenSessionRequest({
        instanceId: 'i-123;rm -rf /',
        instanceName: 'api-server',
        cols: 120,
        rows: 30
      }),
    /Invalid EC2 instance ID/
  )
})

test('validateOpenTunnelSessionRequest rejects invalid endpoints and ports', () => {
  assert.throws(
    () =>
      validateOpenTunnelSessionRequest({
        targetName: 'db',
        targetKind: 'db',
        targetEndpoint: 'db.example.com;evil',
        remotePort: 5432,
        localPort: 54320,
        jumpInstanceId: 'i-0123456789abcdef0',
        jumpInstanceName: 'bastion'
      }),
    /Invalid target endpoint/
  )

  assert.throws(
    () =>
      validateOpenTunnelSessionRequest({
        targetName: 'db',
        targetKind: 'db',
        targetEndpoint: 'db.example.com',
        remotePort: 70000,
        localPort: 54320,
        jumpInstanceId: 'i-0123456789abcdef0',
        jumpInstanceName: 'bastion'
      }),
    /Invalid remote port/
  )
})

test('validate profile requests enforce AWS region format', () => {
  assert.doesNotThrow(() =>
    validateCreateProfileRequest({
      name: 'prod',
      region: 'us-gov-west-1',
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret'
    })
  )

  assert.throws(
    () =>
      validateUpdateProfileRequest({
        id: 'profile-1',
        name: 'prod',
        region: 'us-west-2;bad'
      }),
    /Invalid AWS region/
  )
})

test('validateUpdateRuntimePathsRequest requires absolute paths', () => {
  assert.doesNotThrow(() =>
    validateUpdateRuntimePathsRequest({
      awsCliPath: '/opt/homebrew/bin/aws',
      sessionManagerPluginPath: '/opt/homebrew/bin/session-manager-plugin'
    })
  )

  assert.throws(
    () =>
      validateUpdateRuntimePathsRequest({
        awsCliPath: 'aws',
        sessionManagerPluginPath: null
      }),
    /must be an absolute path/
  )
})

test('shouldEnableRemoteDebugging only enables in unpackaged dev runtime with valid ports', () => {
  assert.equal(
    shouldEnableRemoteDebugging({
      remoteDebuggingPort: '9222',
      isPackaged: false,
      rendererUrl: 'http://127.0.0.1:5173'
    }),
    '9222'
  )

  assert.equal(
    shouldEnableRemoteDebugging({
      remoteDebuggingPort: '9222',
      isPackaged: true,
      rendererUrl: undefined
    }),
    null
  )

  assert.equal(
    shouldEnableRemoteDebugging({
      remoteDebuggingPort: 'abc',
      isPackaged: false,
      rendererUrl: 'http://127.0.0.1:5173'
    }),
    null
  )
})

test('buildProductionContentSecurityPolicy returns a restrictive renderer policy', () => {
  assert.equal(
    buildProductionContentSecurityPolicy(),
    "default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  )
})
