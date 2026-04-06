import test from 'node:test'
import assert from 'node:assert/strict'

import { listS3Buckets, listS3Objects } from './s3-client'

const activeProfile = {
  profile: {
    id: 'profile-1',
    name: 'dev-admin',
    region: 'ap-northeast-2',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    hasSessionToken: false,
    isDefault: true
  },
  credentials: {
    accessKeyId: 'AKIADEVADMIN',
    secretAccessKey: 'super-secret'
  }
} as const

test('listS3Buckets builds S3 client requests from direct credentials', async () => {
  const calls: unknown[] = []
  const buckets = await listS3Buckets(activeProfile, {
    createClient(config) {
      calls.push(config)
      return {
        send: async () => ({
          Buckets: [{ Name: 'logs-bucket' }, { Name: 'reports-bucket' }]
        })
      }
    }
  })

  assert.deepEqual(calls, [
    {
      region: 'ap-northeast-2',
      credentials: {
        accessKeyId: 'AKIADEVADMIN',
        secretAccessKey: 'super-secret',
        sessionToken: undefined
      }
    }
  ])
  assert.deepEqual(buckets, [{ name: 'logs-bucket' }, { name: 'reports-bucket' }])
})

test('listS3Objects combines current prefix and search query while splitting prefixes from objects', async () => {
  const calls: unknown[] = []
  const result = await listS3Objects(
    activeProfile,
    {
      bucketName: 'reports-bucket',
      prefix: 'reports/2026/',
      query: 'april'
    },
    {
      createClient(config) {
        calls.push(config)
        return {
          send: async (command) => ({
            command,
            CommonPrefixes: [
              { Prefix: 'reports/2026/april/' },
              { Prefix: 'reports/2026/april-archive/' }
            ],
            Contents: [
              { Key: 'reports/2026/april/', Size: 0 },
              {
                Key: 'reports/2026/april-summary.csv',
                Size: 512,
                LastModified: new Date('2026-04-01T01:02:03.000Z'),
                StorageClass: 'STANDARD'
              },
              {
                Key: 'reports/2026/april-zeta.csv',
                Size: 1024,
                LastModified: new Date('2026-04-02T01:02:03.000Z'),
                StorageClass: 'GLACIER'
              }
            ],
            IsTruncated: true,
            NextContinuationToken: 'token-1'
          })
        }
      }
    }
  )

  assert.deepEqual(calls, [
    {
      region: 'ap-northeast-2',
      credentials: {
        accessKeyId: 'AKIADEVADMIN',
        secretAccessKey: 'super-secret',
        sessionToken: undefined
      }
    }
  ])
  assert.equal((result as { bucketName: string }).bucketName, 'reports-bucket')
  assert.equal((result as { prefix: string }).prefix, 'reports/2026/april')
  assert.deepEqual((result as { prefixes: Array<{ name: string; prefix: string }> }).prefixes, [
    { name: 'april', prefix: 'reports/2026/april/' },
    { name: 'april-archive', prefix: 'reports/2026/april-archive/' }
  ])
  assert.deepEqual((result as { objects: Array<{ name: string; key: string; storageClass: string | null; kind: string; size: number; lastModified: string | null }> }).objects, [
    {
      key: 'reports/2026/april-summary.csv',
      name: 'april-summary.csv',
      kind: 'object',
      size: 512,
      lastModified: '2026-04-01T01:02:03.000Z',
      storageClass: 'STANDARD'
    },
    {
      key: 'reports/2026/april-zeta.csv',
      name: 'april-zeta.csv',
      kind: 'object',
      size: 1024,
      lastModified: '2026-04-02T01:02:03.000Z',
      storageClass: 'GLACIER'
    }
  ])
  assert.equal((result as { isTruncated: boolean }).isTruncated, true)
  assert.equal((result as { nextContinuationToken?: string }).nextContinuationToken, 'token-1')
})

test('listS3Objects normalizes slash-heavy inputs and sorts prefix/object names ascending', async () => {
  const result = await listS3Objects(
    activeProfile,
    {
      bucketName: 'assets-bucket',
      prefix: '//nested///',
      query: '/images//'
    },
    {
      createClient() {
        return {
          send: async () => ({
            CommonPrefixes: [{ Prefix: 'nested/images/zeta/' }, { Prefix: 'nested/images/alpha/' }],
            Contents: [
              { Key: 'nested/images/z-last.png', Size: 42 },
              { Key: 'nested/images/a-first.png', Size: 21 }
            ],
            IsTruncated: false
          })
        }
      }
    }
  )

  assert.equal((result as { prefix: string }).prefix, 'nested/images')
  assert.deepEqual((result as { prefixes: Array<{ name: string }> }).prefixes.map((item) => item.name), ['alpha', 'zeta'])
  assert.deepEqual((result as { objects: Array<{ name: string }> }).objects.map((item) => item.name), [
    'a-first.png',
    'z-last.png'
  ])
})
