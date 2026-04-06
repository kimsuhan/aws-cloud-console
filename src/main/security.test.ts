import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildProductionContentSecurityPolicy,
  validateCreateSavedShortcutRequest,
  validateListS3ObjectsRequest,
  shouldEnableRemoteDebugging,
  validateUpdateAppSettingsRequest,
  validateCreateProfileRequest,
  validateOpenSessionRequest,
  validateOpenTunnelSessionRequest,
  validateUpdateProfileRequest,
  validateUpdateRuntimePathsRequest
} from './security'

test('validateOpenSessionRequest accepts valid EC2 instance identifiers', () => {
  assert.doesNotThrow(() =>
    validateOpenSessionRequest({
      profileId: 'profile-1',
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
        profileId: 'profile-1',
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
        profileId: 'profile-1',
        targetId: 'db-cluster:orders',
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
        profileId: 'profile-1',
        targetId: 'db-cluster:orders',
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

test('validateOpenSessionRequest and validateOpenTunnelSessionRequest require a profile id', () => {
  assert.throws(
    () =>
      validateOpenSessionRequest({
        profileId: '',
        instanceId: 'i-0123456789abcdef0',
        instanceName: 'api-server',
        cols: 120,
        rows: 30
      }),
    /Profile is required/
  )

  assert.throws(
    () =>
      validateOpenTunnelSessionRequest({
        profileId: '',
        targetId: 'db-cluster:orders',
        targetName: 'db',
        targetKind: 'db',
        targetEndpoint: 'db.example.com',
        remotePort: 5432,
        localPort: 54320,
        jumpInstanceId: 'i-0123456789abcdef0',
        jumpInstanceName: 'bastion'
      }),
    /Profile is required/
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

test('validateUpdateAppSettingsRequest rejects unsupported UI scale values', () => {
  assert.doesNotThrow(() =>
    validateUpdateAppSettingsRequest({
      theme: 'system',
      uiScale: '110'
    })
  )

  assert.throws(
    () =>
      validateUpdateAppSettingsRequest({
        uiScale: '130' as '110'
      }),
    /Invalid app UI scale/
  )
})

test('validateCreateSavedShortcutRequest validates regions and shortcut payloads', () => {
  assert.doesNotThrow(() =>
    validateCreateSavedShortcutRequest({
      category: 'favorite',
      label: 'api shell',
      profileId: 'profile-1',
      profileName: 'dev-admin',
      region: 'ap-northeast-2',
      launchKind: 'ssm',
      payload: {
        instanceId: 'i-0123456789abcdef0',
        instanceName: 'api-server'
      }
    })
  )

  assert.throws(
    () =>
      validateCreateSavedShortcutRequest({
        category: 'preset',
        label: 'orders tunnel',
        profileId: 'profile-1',
        profileName: 'dev-admin',
        region: 'ap-northeast-2',
        launchKind: 'tunnel',
        payload: {
          targetId: 'db-cluster:orders',
          targetKind: 'db',
          targetName: 'orders-db',
          targetEndpoint: 'db.example.com',
          remotePort: 5432,
          jumpInstanceId: 'i-invalid',
          jumpInstanceName: 'bastion',
          preferredLocalPort: 15432
        }
      }),
    /Invalid EC2 instance ID/
  )
})

test('validateListS3ObjectsRequest accepts normalized S3 browse requests and rejects unsafe input', () => {
  assert.doesNotThrow(() =>
    validateListS3ObjectsRequest({
      profileId: 'profile-1',
      bucketName: 'reports-bucket',
      prefix: 'reports/2026/',
      query: 'april'
    })
  )

  assert.throws(
    () =>
      validateListS3ObjectsRequest({
        profileId: 'profile-1',
        bucketName: '',
        prefix: '',
        query: ''
      }),
    /Bucket name is required/
  )

  assert.throws(
    () =>
      validateListS3ObjectsRequest({
        profileId: 'profile-1',
        bucketName: 'reports-bucket',
        prefix: 'reports\\2026',
        query: 'april'
      }),
    /Invalid S3 prefix/
  )

  assert.throws(
    () =>
      validateListS3ObjectsRequest({
        profileId: 'profile-1',
        bucketName: 'reports-bucket',
        prefix: 'reports/2026/',
        query: `${'a'.repeat(260)}`
      }),
    /Invalid S3 query/
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
