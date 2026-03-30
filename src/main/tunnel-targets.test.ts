import test from 'node:test'
import assert from 'node:assert/strict'

import {
  listTunnelTargets,
  mapDbClusterTargets,
  mapDbInstanceTargets,
  mapReplicationGroupTargets,
  mapServerlessCacheTargets
} from './tunnel-targets'

const activeProfile = {
  profile: {
    id: 'profile-1',
    name: 'ility',
    region: 'ap-southeast-1',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    hasSessionToken: false,
    isDefault: true
  },
  credentials: {
    accessKeyId: 'AKIAILITY',
    secretAccessKey: 'super-secret'
  }
}

test('listTunnelTargets loads database targets with direct credentials', async () => {
  const configs: Array<{ kind: 'rds' | 'elasticache'; config: unknown }> = []
  const targets = await listTunnelTargets(activeProfile, 'db', {
    createRdsClient(config) {
      configs.push({ kind: 'rds', config })
      return {
        send: async (command) => {
          const commandName = command.constructor.name
          if (commandName === 'DescribeDBInstancesCommand') {
            return {
              DBInstances: [
                {
                  DBInstanceIdentifier: 'ility-db',
                  Engine: 'postgres',
                  Endpoint: { Address: 'ility-db.example', Port: 5432 }
                }
              ]
            }
          }

          return {
            DBClusters: [
              {
                DBClusterIdentifier: 'ility-cluster',
                Engine: 'aurora-postgresql',
                Endpoint: 'ility-cluster.example',
                Port: 5432
              }
            ]
          }
        }
      }
    },
    createElasticacheClient(config) {
      configs.push({ kind: 'elasticache', config })
      return {
        send: async () => ({})
      }
    }
  })

  assert.deepEqual(configs, [
    {
      kind: 'rds',
      config: {
        region: 'ap-southeast-1',
        credentials: {
          accessKeyId: 'AKIAILITY',
          secretAccessKey: 'super-secret',
          sessionToken: undefined
        }
      }
    }
  ])
  assert.deepEqual(
    targets.map((target) => ({ id: target.id, source: target.source })),
    [
      { id: 'db-instance:ility-db', source: 'rds-instance' },
      { id: 'db-cluster:ility-cluster', source: 'rds-cluster' }
    ]
  )
})

test('listTunnelTargets loads redis targets with direct credentials', async () => {
  const configs: Array<{ kind: 'rds' | 'elasticache'; config: unknown }> = []
  const targets = await listTunnelTargets(activeProfile, 'redis', {
    createRdsClient(config) {
      configs.push({ kind: 'rds', config })
      return {
        send: async () => ({})
      }
    },
    createElasticacheClient(config) {
      configs.push({ kind: 'elasticache', config })
      return {
        send: async (command) => {
          const commandName = command.constructor.name
          if (commandName === 'DescribeReplicationGroupsCommand') {
            return {
              ReplicationGroups: [
                {
                  ReplicationGroupId: 'ility-redis',
                  Engine: 'redis',
                  ConfigurationEndpoint: { Address: 'ility-redis.example', Port: 6379 }
                }
              ]
            }
          }

          return {
            ServerlessCaches: [
              {
                ServerlessCacheName: 'ility-serverless',
                Engine: 'redis',
                Endpoint: { Address: 'ility-serverless.example', Port: 6379 }
              }
            ]
          }
        }
      }
    }
  })

  assert.deepEqual(configs, [
    {
      kind: 'elasticache',
      config: {
        region: 'ap-southeast-1',
        credentials: {
          accessKeyId: 'AKIAILITY',
          secretAccessKey: 'super-secret',
          sessionToken: undefined
        }
      }
    }
  ])
  assert.deepEqual(
    targets.map((target) => ({ id: target.id, source: target.source })),
    [
      { id: 'redis-rg:ility-redis', source: 'elasticache-replication-group' },
      { id: 'redis-serverless:ility-serverless', source: 'elasticache-serverless' }
    ]
  )
})

test('mapDbInstanceTargets returns endpoint based tunnel rows', () => {
  const targets = mapDbInstanceTargets({
    DBInstances: [
      {
        DBInstanceIdentifier: 'ility-db',
        Engine: 'postgres',
        Endpoint: {
          Address: 'ility-db.abc.apse1.rds.amazonaws.com',
          Port: 5432
        }
      }
    ]
  })

  assert.deepEqual(targets, [
    {
      id: 'db-instance:ility-db',
      kind: 'db',
      name: 'ility-db',
      engine: 'postgres',
      endpoint: 'ility-db.abc.apse1.rds.amazonaws.com',
      remotePort: 5432,
      source: 'rds-instance'
    }
  ])
})

test('mapDbClusterTargets returns cluster endpoint tunnel rows', () => {
  const targets = mapDbClusterTargets({
    DBClusters: [
      {
        DBClusterIdentifier: 'ility-cluster',
        Engine: 'aurora-postgresql',
        Endpoint: 'ility-cluster.cluster-abc.apse1.rds.amazonaws.com',
        Port: 5432
      }
    ]
  })

  assert.deepEqual(targets, [
    {
      id: 'db-cluster:ility-cluster',
      kind: 'db',
      name: 'ility-cluster',
      engine: 'aurora-postgresql',
      endpoint: 'ility-cluster.cluster-abc.apse1.rds.amazonaws.com',
      remotePort: 5432,
      source: 'rds-cluster'
    }
  ])
})

test('mapReplicationGroupTargets returns primary redis endpoints', () => {
  const targets = mapReplicationGroupTargets({
    ReplicationGroups: [
      {
        ReplicationGroupId: 'ility-redis',
        Engine: 'redis',
        NodeGroups: [
          {
            PrimaryEndpoint: {
              Address: 'ility-redis.abc.use1.cache.amazonaws.com',
              Port: 6379
            }
          }
        ]
      }
    ]
  })

  assert.deepEqual(targets, [
    {
      id: 'redis-rg:ility-redis',
      kind: 'redis',
      name: 'ility-redis',
      engine: 'redis',
      endpoint: 'ility-redis.abc.use1.cache.amazonaws.com',
      remotePort: 6379,
      source: 'elasticache-replication-group'
    }
  ])
})

test('mapServerlessCacheTargets returns serverless cache endpoints', () => {
  const targets = mapServerlessCacheTargets({
    ServerlessCaches: [
      {
        ServerlessCacheName: 'ility-redis-serverless',
        Engine: 'redis',
        Endpoint: {
          Address: 'ility-serverless.abc.use1.cache.amazonaws.com',
          Port: 6379
        }
      }
    ]
  })

  assert.deepEqual(targets, [
    {
      id: 'redis-serverless:ility-redis-serverless',
      kind: 'redis',
      name: 'ility-redis-serverless',
      engine: 'redis',
      endpoint: 'ility-serverless.abc.use1.cache.amazonaws.com',
      remotePort: 6379,
      source: 'elasticache-serverless'
    }
  ])
})
