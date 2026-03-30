import {
  DescribeReplicationGroupsCommand,
  DescribeServerlessCachesCommand,
  ElastiCacheClient,
  type DescribeReplicationGroupsCommandOutput,
  type DescribeServerlessCachesCommandOutput,
  type ElastiCacheClientConfig
} from '@aws-sdk/client-elasticache'
import {
  DescribeDBClustersCommand,
  DescribeDBInstancesCommand,
  RDSClient,
  type DescribeDBClustersCommandOutput,
  type DescribeDBInstancesCommandOutput,
  type RDSClientConfig
} from '@aws-sdk/client-rds'

import type { TunnelKind, TunnelTargetSummary } from '../shared/contracts'
import type { ActiveProfileWithCredentials } from './profile-store'

interface RdsClientLike {
  send(command: DescribeDBInstancesCommand | DescribeDBClustersCommand): Promise<DescribeDBInstancesCommandOutput | DescribeDBClustersCommandOutput>
}

interface ElasticacheClientLike {
  send(
    command: DescribeReplicationGroupsCommand | DescribeServerlessCachesCommand
  ): Promise<DescribeReplicationGroupsCommandOutput | DescribeServerlessCachesCommandOutput>
}

interface TunnelTargetClientFactory {
  createRdsClient(config: RDSClientConfig): RdsClientLike
  createElasticacheClient(config: ElastiCacheClientConfig): ElasticacheClientLike
}

function createClientConfig(activeProfile: ActiveProfileWithCredentials): RDSClientConfig & ElastiCacheClientConfig {
  return {
    region: activeProfile.profile.region,
    credentials: {
      accessKeyId: activeProfile.credentials.accessKeyId,
      secretAccessKey: activeProfile.credentials.secretAccessKey,
      sessionToken: activeProfile.credentials.sessionToken
    }
  }
}

export function mapDbInstanceTargets(output: DescribeDBInstancesCommandOutput): TunnelTargetSummary[] {
  return (output.DBInstances ?? [])
    .filter((instance) => instance.Endpoint?.Address && instance.Endpoint?.Port)
    .map((instance) => ({
      id: `db-instance:${instance.DBInstanceIdentifier ?? 'unknown'}`,
      kind: 'db' as TunnelKind,
      name: instance.DBInstanceIdentifier ?? 'unknown-db-instance',
      engine: instance.Engine ?? 'unknown',
      endpoint: instance.Endpoint?.Address ?? '',
      remotePort: instance.Endpoint?.Port ?? 0,
      source: 'rds-instance'
    }))
}

export function mapDbClusterTargets(output: DescribeDBClustersCommandOutput): TunnelTargetSummary[] {
  return (output.DBClusters ?? [])
    .filter((cluster) => cluster.Endpoint && cluster.Port)
    .map((cluster) => ({
      id: `db-cluster:${cluster.DBClusterIdentifier ?? 'unknown'}`,
      kind: 'db' as TunnelKind,
      name: cluster.DBClusterIdentifier ?? 'unknown-db-cluster',
      engine: cluster.Engine ?? 'unknown',
      endpoint: cluster.Endpoint ?? '',
      remotePort: cluster.Port ?? 0,
      source: 'rds-cluster'
    }))
}

export function mapReplicationGroupTargets(output: DescribeReplicationGroupsCommandOutput): TunnelTargetSummary[] {
  return (output.ReplicationGroups ?? []).flatMap((group) => {
    const endpoint =
      group.ConfigurationEndpoint ?? group.NodeGroups?.find((nodeGroup) => nodeGroup.PrimaryEndpoint)?.PrimaryEndpoint

    if (!endpoint?.Address || !endpoint.Port) {
      return []
    }

    return [
      {
        id: `redis-rg:${group.ReplicationGroupId ?? 'unknown'}`,
        kind: 'redis' as TunnelKind,
        name: group.ReplicationGroupId ?? 'unknown-redis-group',
        engine: group.Engine ?? 'redis',
        endpoint: endpoint.Address,
        remotePort: endpoint.Port,
        source: 'elasticache-replication-group'
      }
    ]
  })
}

export function mapServerlessCacheTargets(output: DescribeServerlessCachesCommandOutput): TunnelTargetSummary[] {
  return (output.ServerlessCaches ?? [])
    .filter((cache) => cache.Endpoint?.Address && cache.Endpoint?.Port)
    .map((cache) => ({
      id: `redis-serverless:${cache.ServerlessCacheName ?? 'unknown'}`,
      kind: 'redis' as TunnelKind,
      name: cache.ServerlessCacheName ?? 'unknown-serverless-cache',
      engine: cache.Engine ?? 'redis',
      endpoint: cache.Endpoint?.Address ?? '',
      remotePort: cache.Endpoint?.Port ?? 0,
      source: 'elasticache-serverless'
    }))
}

export async function listTunnelTargets(
  activeProfile: ActiveProfileWithCredentials,
  kind: TunnelKind,
  factory: TunnelTargetClientFactory = {
    createRdsClient(config) {
      return new RDSClient(config)
    },
    createElasticacheClient(config) {
      return new ElastiCacheClient(config)
    }
  }
): Promise<TunnelTargetSummary[]> {
  const config = createClientConfig(activeProfile)

  if (kind === 'db') {
    const client = factory.createRdsClient(config)
    const [instances, clusters] = await Promise.all([
      client.send(new DescribeDBInstancesCommand({})) as Promise<DescribeDBInstancesCommandOutput>,
      client.send(new DescribeDBClustersCommand({})) as Promise<DescribeDBClustersCommandOutput>
    ])

    return [...mapDbInstanceTargets(instances), ...mapDbClusterTargets(clusters)]
  }

  const client = factory.createElasticacheClient(config)
  const [replicationGroups, serverlessCaches] = await Promise.all([
    client.send(new DescribeReplicationGroupsCommand({})) as Promise<DescribeReplicationGroupsCommandOutput>,
    client.send(new DescribeServerlessCachesCommand({})) as Promise<DescribeServerlessCachesCommandOutput>
  ])

  return [...mapReplicationGroupTargets(replicationGroups), ...mapServerlessCacheTargets(serverlessCaches)]
}
