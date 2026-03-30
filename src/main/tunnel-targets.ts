import { spawn } from 'node:child_process'

import type { ActiveProfileState, TunnelKind, TunnelTargetSummary } from '../shared/contracts'

function runAwsCommand(command: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1))
    let output = ''
    let errorOutput = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString()
    })

    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve(output)
        return
      }

      reject(new Error(errorOutput.trim() || `AWS query failed with exit code ${code ?? 'unknown'}`))
    })
  })
}

function baseAwsArgs(activeProfile: ActiveProfileState): string[] {
  return ['aws', '--profile', activeProfile.profileName, '--region', activeProfile.region]
}

export function buildDescribeDbInstancesCommand(activeProfile: ActiveProfileState): string[] {
  return [...baseAwsArgs(activeProfile), 'rds', 'describe-db-instances', '--output', 'json']
}

export function buildDescribeDbClustersCommand(activeProfile: ActiveProfileState): string[] {
  return [...baseAwsArgs(activeProfile), 'rds', 'describe-db-clusters', '--output', 'json']
}

export function buildDescribeReplicationGroupsCommand(activeProfile: ActiveProfileState): string[] {
  return [...baseAwsArgs(activeProfile), 'elasticache', 'describe-replication-groups', '--output', 'json']
}

export function buildDescribeServerlessCachesCommand(activeProfile: ActiveProfileState): string[] {
  return [...baseAwsArgs(activeProfile), 'elasticache', 'describe-serverless-caches', '--output', 'json']
}

export function mapDbInstanceTargets(stdout: string): TunnelTargetSummary[] {
  const parsed = JSON.parse(stdout) as {
    DBInstances?: Array<{
      DBInstanceIdentifier?: string
      Engine?: string
      Endpoint?: { Address?: string; Port?: number }
    }>
  }

  return (parsed.DBInstances ?? [])
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

export function mapDbClusterTargets(stdout: string): TunnelTargetSummary[] {
  const parsed = JSON.parse(stdout) as {
    DBClusters?: Array<{
      DBClusterIdentifier?: string
      Engine?: string
      Endpoint?: string
      Port?: number
    }>
  }

  return (parsed.DBClusters ?? [])
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

export function mapReplicationGroupTargets(stdout: string): TunnelTargetSummary[] {
  const parsed = JSON.parse(stdout) as {
    ReplicationGroups?: Array<{
      ReplicationGroupId?: string
      Engine?: string
      ConfigurationEndpoint?: { Address?: string; Port?: number }
      NodeGroups?: Array<{ PrimaryEndpoint?: { Address?: string; Port?: number } }>
    }>
  }

  return (parsed.ReplicationGroups ?? [])
    .flatMap((group) => {
      const endpoint =
        group.ConfigurationEndpoint ??
        group.NodeGroups?.find((nodeGroup) => nodeGroup.PrimaryEndpoint)?.PrimaryEndpoint

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

export function mapServerlessCacheTargets(stdout: string): TunnelTargetSummary[] {
  const parsed = JSON.parse(stdout) as {
    ServerlessCaches?: Array<{
      ServerlessCacheName?: string
      Engine?: string
      Endpoint?: { Address?: string; Port?: number }
    }>
  }

  return (parsed.ServerlessCaches ?? [])
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

export async function listTunnelTargets(activeProfile: ActiveProfileState, kind: TunnelKind): Promise<TunnelTargetSummary[]> {
  if (kind === 'db') {
    const [instances, clusters] = await Promise.all([
      runAwsCommand(buildDescribeDbInstancesCommand(activeProfile)),
      runAwsCommand(buildDescribeDbClustersCommand(activeProfile))
    ])

    return [...mapDbInstanceTargets(instances), ...mapDbClusterTargets(clusters)]
  }

  const [replicationGroups, serverlessCaches] = await Promise.all([
    runAwsCommand(buildDescribeReplicationGroupsCommand(activeProfile)),
    runAwsCommand(buildDescribeServerlessCachesCommand(activeProfile))
  ])

  return [...mapReplicationGroupTargets(replicationGroups), ...mapServerlessCacheTargets(serverlessCaches)]
}
