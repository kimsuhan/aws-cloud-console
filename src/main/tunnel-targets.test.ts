import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDescribeDbClustersCommand,
  buildDescribeDbInstancesCommand,
  buildDescribeServerlessCachesCommand,
  buildDescribeReplicationGroupsCommand,
  mapDbClusterTargets,
  mapDbInstanceTargets,
  mapReplicationGroupTargets,
  mapServerlessCacheTargets
} from './tunnel-targets'

test('buildDescribeDbInstancesCommand uses active profile and region', () => {
  const command = buildDescribeDbInstancesCommand({
    profileName: 'ility',
    region: 'ap-southeast-1'
  })

  assert.deepEqual(command, [
    'aws',
    '--profile',
    'ility',
    '--region',
    'ap-southeast-1',
    'rds',
    'describe-db-instances',
    '--output',
    'json'
  ])
})

test('buildDescribeDbClustersCommand uses active profile and region', () => {
  const command = buildDescribeDbClustersCommand({
    profileName: 'ility',
    region: 'ap-southeast-1'
  })

  assert.deepEqual(command, [
    'aws',
    '--profile',
    'ility',
    '--region',
    'ap-southeast-1',
    'rds',
    'describe-db-clusters',
    '--output',
    'json'
  ])
})

test('buildDescribeReplicationGroupsCommand uses active profile and region', () => {
  const command = buildDescribeReplicationGroupsCommand({
    profileName: 'ility',
    region: 'ap-southeast-1'
  })

  assert.deepEqual(command, [
    'aws',
    '--profile',
    'ility',
    '--region',
    'ap-southeast-1',
    'elasticache',
    'describe-replication-groups',
    '--output',
    'json'
  ])
})

test('buildDescribeServerlessCachesCommand uses active profile and region', () => {
  const command = buildDescribeServerlessCachesCommand({
    profileName: 'ility',
    region: 'ap-southeast-1'
  })

  assert.deepEqual(command, [
    'aws',
    '--profile',
    'ility',
    '--region',
    'ap-southeast-1',
    'elasticache',
    'describe-serverless-caches',
    '--output',
    'json'
  ])
})

test('mapDbInstanceTargets returns endpoint based tunnel rows', () => {
  const targets = mapDbInstanceTargets(JSON.stringify({
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
  }))

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
  const targets = mapDbClusterTargets(JSON.stringify({
    DBClusters: [
      {
        DBClusterIdentifier: 'ility-aurora',
        Engine: 'aurora-postgresql',
        Endpoint: 'ility-aurora.cluster-abc.apse1.rds.amazonaws.com',
        Port: 5432
      }
    ]
  }))

  assert.deepEqual(targets, [
    {
      id: 'db-cluster:ility-aurora',
      kind: 'db',
      name: 'ility-aurora',
      engine: 'aurora-postgresql',
      endpoint: 'ility-aurora.cluster-abc.apse1.rds.amazonaws.com',
      remotePort: 5432,
      source: 'rds-cluster'
    }
  ])
})

test('mapReplicationGroupTargets returns primary redis endpoints', () => {
  const targets = mapReplicationGroupTargets(JSON.stringify({
    ReplicationGroups: [
      {
        ReplicationGroupId: 'ility-redis',
        Engine: 'redis',
        ConfigurationEndpoint: {
          Address: 'ility-redis.cfg.use1.cache.amazonaws.com',
          Port: 6379
        }
      }
    ]
  }))

  assert.deepEqual(targets, [
    {
      id: 'redis-rg:ility-redis',
      kind: 'redis',
      name: 'ility-redis',
      engine: 'redis',
      endpoint: 'ility-redis.cfg.use1.cache.amazonaws.com',
      remotePort: 6379,
      source: 'elasticache-replication-group'
    }
  ])
})

test('mapServerlessCacheTargets returns serverless cache endpoints', () => {
  const targets = mapServerlessCacheTargets(JSON.stringify({
    ServerlessCaches: [
      {
        ServerlessCacheName: 'ility-serverless',
        Engine: 'redis',
        Endpoint: {
          Address: 'ility-serverless.serverless.apse1.cache.amazonaws.com',
          Port: 6379
        }
      }
    ]
  }))

  assert.deepEqual(targets, [
    {
      id: 'redis-serverless:ility-serverless',
      kind: 'redis',
      name: 'ility-serverless',
      engine: 'redis',
      endpoint: 'ility-serverless.serverless.apse1.cache.amazonaws.com',
      remotePort: 6379,
      source: 'elasticache-serverless'
    }
  ])
})
